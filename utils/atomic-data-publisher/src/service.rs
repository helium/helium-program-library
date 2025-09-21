use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::{signal, time::{interval, sleep}};
use tracing::{debug, error, info, warn};

use crate::config::{ServiceConfig, Settings};
use crate::database::DatabaseClient;
use crate::errors::AtomicDataError;
use crate::metrics::MetricsCollector;
use crate::publisher::AtomicDataPublisher as Publisher;

const HEALTH_CHECK_INTERVAL_SECONDS: u64 = 30;
const POLLING_ERROR_RETRY_SECONDS: u64 = 5;

#[derive(Debug, Clone)]
pub struct AtomicDataPublisher {
  database: Arc<DatabaseClient>,
  publisher: Arc<Publisher>,
  metrics: Arc<MetricsCollector>,
  config: Settings,
  shutdown_signal: tokio::sync::watch::Receiver<bool>,
  pub shutdown_sender: tokio::sync::watch::Sender<bool>,
}

impl AtomicDataPublisher {
  async fn validate_tables(database: &DatabaseClient, tables: &[String]) -> Result<(), AtomicDataError> {
    for table_name in tables {
      if !database.table_exists(table_name).await? {
        return Err(AtomicDataError::ConfigError(format!(
          "Required table '{}' does not exist",
          table_name
        )));
      }
    }
    Ok(())
  }

  async fn init_database(database: &DatabaseClient, service_config: &ServiceConfig) -> Result<(), AtomicDataError> {
    database.create_state_table().await?;

    if service_config.polling_jobs.is_empty() {
      warn!("No polling jobs configured");
    }
    Ok(())
  }

  pub async fn new(config: Settings) -> Result<Self, AtomicDataError> {
    info!("Initializing Atomic Data Publisher service");

    let metrics = Arc::new(MetricsCollector::new()?);

    let database = Arc::new(
      DatabaseClient::new_with_metrics(
        &config.database,
        config.service.polling_jobs.clone(),
        Some(metrics.clone())
      ).await?,
    );

    Self::validate_tables(&database, &config.database.required_tables).await?;
    Self::init_database(&database, &config.service).await?;
    database.init_polling_state().await?;
    database.cleanup_stale_jobs().await?;

    let keypair_path = config.signing.keypair_path.clone();
    let keypair_data = if std::path::Path::new(&keypair_path).exists() {
      std::fs::read(&keypair_path)?
    } else {
      return Err(AtomicDataError::ConfigError(format!(
        "Keypair file not found at {}. Please provide a valid keypair file.",
        keypair_path
      )));
    };

    let keypair = Keypair::try_from(&keypair_data[..])
      .map_err(|e| AtomicDataError::ConfigError(format!("Failed to load keypair from file: {}", e)))?;

    info!("Using keypair with public key: {}", keypair.public_key());

    let publisher = Arc::new(Publisher::new(
      config.service.polling_jobs.clone(),
      keypair,
      config.service.clone(),
      config.ingestor.clone(),
      metrics.clone(),
    ).await?);

    let (shutdown_sender, shutdown_signal) = tokio::sync::watch::channel(false);

    Ok(Self {
      database,
      publisher,
      metrics,
      config,
      shutdown_signal,
      shutdown_sender,
    })
  }

  pub async fn run(&self) -> Result<(), AtomicDataError> {
    self.health_check().await?;
    let (handles, _metrics_bind_addr) = self.spawn_background_tasks().await?;
    let shutdown_sender = self.shutdown_sender.clone();
    let signal_handle = tokio::spawn(async move {
      tokio::select! {
        _ = signal::ctrl_c() => {
          info!("Received Ctrl+C within service, initiating graceful shutdown");
        }
        _ = async {
          signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await
        } => {
          info!("Received SIGTERM within service, initiating graceful shutdown");
        }
      }

      if let Err(e) = shutdown_sender.send(true) {
        error!("Failed to send internal shutdown signal: {}", e);
      }
    });

    let mut shutdown_signal = self.shutdown_signal.clone();
    tokio::select! {
        _ = shutdown_signal.changed() => {
            info!("Shutdown signal received");
        }
        result = futures::future::try_join_all(handles) => {
            match result {
                Ok(results) => {
                    let failed_tasks = results.iter().filter(|r| r.is_err()).count();
                    if failed_tasks > 0 {
                        warn!("{} out of {} background tasks failed", failed_tasks, results.len());
                    } else {
                        info!("All background tasks completed successfully");
                    }
                }
                Err(e) => error!("Background task failure: {}", e),
            }
        }
        _ = signal_handle => {
          // Signal handler completed
        }
    }

    self.perform_graceful_shutdown().await?;
    info!("Atomic Data Publisher service stopped");
    Ok(())
  }

  async fn spawn_background_tasks(&self) -> Result<(Vec<tokio::task::JoinHandle<Result<(), AtomicDataError>>>, String), AtomicDataError> {
    let mut handles = Vec::new();
    let metrics_bind_addr = format!("0.0.0.0:{}", self.config.service.port);
    let metrics_handle = {
      let metrics = self.metrics.clone();
      let shutdown_signal = self.shutdown_signal.clone();
      let bind_addr = metrics_bind_addr.clone();
      tokio::spawn(async move {
        if let Err(e) = metrics.serve_metrics(&bind_addr, shutdown_signal).await {
          error!("Metrics server error: {}", e);
          return Err(AtomicDataError::NetworkError(e.to_string()));
        }
        Ok(())
      })
    };
    handles.push(metrics_handle);
    info!("Metrics server started on {}", metrics_bind_addr);

    let polling_handle = {
      let service = self.clone();
      tokio::spawn(async move {
        service.polling_loop().await;
        Ok(())
      })
    };
    handles.push(polling_handle);

    let health_handle = {
      let service = self.clone();
      tokio::spawn(async move {
        service.health_check_loop().await;
        Ok(())
      })
    };
    handles.push(health_handle);

    Ok((handles, metrics_bind_addr))
  }

  async fn perform_graceful_shutdown(&self) -> Result<(), AtomicDataError> {
    info!("Performing graceful shutdown cleanup");

    if let Err(e) = self.database.cleanup_all_jobs().await {
      warn!("Failed to clean up running job states during shutdown: {}", e);
    }

    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(())
  }

  async fn polling_loop(&self) {
    let mut interval = interval(self.config.polling_interval());
    let mut shutdown_signal = self.shutdown_signal.clone();

    info!(
      "Starting polling loop with interval: {:?}",
      self.config.polling_interval()
    );

    loop {
      tokio::select! {
          _ = interval.tick() => {
              let cycle_start = Instant::now();

              if let Err(e) = self.process_changes().await {
                  error!("Error processing changes: {}", e);
                  self.metrics.increment_errors();
                  sleep(Duration::from_secs(POLLING_ERROR_RETRY_SECONDS)).await;
              }

              let cycle_time = cycle_start.elapsed();
              debug!("Polling cycle completed in {:?}", cycle_time);
          }
          _ = shutdown_signal.changed() => {
              if *shutdown_signal.borrow() {
                  info!("Shutting down polling loop");
                  break;
              }
          }
      }
    }
  }

  async fn process_changes(&self) -> Result<(), AtomicDataError> {
    if self.database.any_job_running().await? {
      debug!("Job already running, skipping to prevent OOM");
      return Ok(());
    }

    let mut total_jobs_processed = 0;
    let mut total_changes_published = 0;
    let mut total_changes_failed = 0;

    loop {
      let changes_and_job = self
        .database
        .get_pending_changes()
        .await?;

      let (changes, active_job_context, target_block) = match changes_and_job {
        Some((changes, job_context, target_block)) => (changes, Some(job_context), target_block),
        None => {
          debug!(
            "No more jobs in queue, processed {} jobs total",
            total_jobs_processed
          );
          break;
        }
      };

      total_jobs_processed += 1;
      let job_name = active_job_context
        .as_ref()
        .map(|(name, _)| name.as_str())
        .unwrap_or("unknown");

      if changes.is_empty() {
        debug!(
          "No changes found for job '{}', advancing to block {}",
          job_name, target_block
        );
        if let Some((job_name, query_name)) = active_job_context {
          let empty_changes = vec![];
          self
            .database
            .mark_processed(&empty_changes, target_block)
            .await?;
          self
            .database
            .mark_job_not_running(&job_name, &query_name)
            .await?;
          self.database.mark_completed(&job_name, &query_name).await?;
        }
        continue;
      }

      info!(
        "Processing {} changes for job '{}' in batches of {}",
        changes.len(),
        job_name,
        self.config.service.batch_size
      );

      let (job_published, job_failed, should_break) = self
        .process_job_changes(changes, active_job_context, target_block)
        .await?;
      total_changes_published += job_published;
      total_changes_failed += job_failed;

      if should_break {
        break;
      }
    }

    if total_jobs_processed > 0 {
      info!(
        "Completed processing cycle: {} jobs processed, {} total changes published, {} total failed",
        total_jobs_processed, total_changes_published, total_changes_failed
      );
    }

    Ok(())
  }

  async fn process_job_changes(
    &self,
    changes: Vec<crate::database::ChangeRecord>,
    active_job_context: Option<(String, String)>,
    target_block: u64,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let (total_published, total_failed, should_break) = self.process_batches(changes, &active_job_context, target_block).await?;
    self.finalize_job_state(&active_job_context, total_failed).await?;
    Ok((total_published, total_failed, should_break))
  }

  async fn process_batches(
    &self,
    changes: Vec<crate::database::ChangeRecord>,
    _active_job_context: &Option<(String, String)>,
    target_block: u64,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_failed = 0;
    let batch_size = self.config.service.batch_size as usize;

    for (batch_index, batch) in changes.chunks(batch_size).enumerate() {
      info!("Processing batch {}: {} changes", batch_index + 1, batch.len());

      let (batch_published, batch_failed) = self.process_batch(batch, target_block).await?;
      total_published += batch_published;
      total_failed += batch_failed;

      if batch_failed > 0 {
        warn!(
          "Batch {} had {} failed changes, stopping processing",
          batch_index + 1, batch_failed
        );
        return Ok((total_published, total_failed, true));
      }
    }

    info!("Completed processing all batches: {} published, {} failed", total_published, total_failed);
    Ok((total_published, total_failed, false))
  }

  async fn process_batch(
    &self,
    batch: &[crate::database::ChangeRecord],
    target_block: u64,
  ) -> Result<(usize, usize), AtomicDataError> {
    let batch_start = Instant::now();
    let semaphore = Arc::new(tokio::sync::Semaphore::new(
      self.config.service.max_concurrent_publishes as usize,
    ));

    let tasks: Vec<_> = batch
      .iter()
      .map(|change| {
        let change = change.clone();
        let publisher = self.publisher.clone();
        let metrics = self.metrics.clone();
        let semaphore = semaphore.clone();

        tokio::spawn(async move {
          Self::publish_single_change(change, publisher, metrics, semaphore).await
        })
      })
      .collect();

    let mut published_changes = Vec::new();
    let mut failed_changes = Vec::new();

    for task in tasks {
      match task.await {
        Ok(Ok(change)) => published_changes.push(change),
        Ok(Err(change)) => failed_changes.push(change),
        Err(e) => {
          error!(
            "Publishing task panicked: {}. This indicates a serious bug in the publishing logic.",
            e
          );
          self.metrics.increment_errors();
        }
      }
    }

    let batch_published = published_changes.len();
    let batch_failed = failed_changes.len();
    if !published_changes.is_empty() {
      self.database.mark_processed(&published_changes, target_block).await?;
    }

    let batch_time = batch_start.elapsed();
    info!(
      "Batch completed in {:?}: {} published, {} failed",
      batch_time, batch_published, batch_failed
    );

    Ok((batch_published, batch_failed))
  }

  async fn publish_single_change(
    change: crate::database::ChangeRecord,
    publisher: Arc<Publisher>,
    metrics: Arc<MetricsCollector>,
    semaphore: Arc<tokio::sync::Semaphore>,
  ) -> Result<crate::database::ChangeRecord, crate::database::ChangeRecord> {
    let _permit = semaphore.acquire().await.map_err(|_| {
      error!(
        "Failed to acquire semaphore permit for publishing change from job '{}'. This may indicate high concurrency or semaphore configuration issues.",
        change.job_name
      );
      change.clone()
    })?;

    let publish_start = Instant::now();
    let result = publisher.publish_changes(vec![change.clone()]).await;
    let publish_duration = publish_start.elapsed().as_secs_f64();

    match result {
      Ok(published_ids) if !published_ids.is_empty() => {
        metrics.increment_published();
        metrics.observe_publish_duration(publish_duration);
        Ok(change)
      }
      Ok(_) => {
        metrics.increment_errors();
        metrics.observe_publish_duration(publish_duration);
        Err(change)
      }
      Err(e) => {
        error!(
          "Failed to publish change for job '{}' (duration: {:.2}s): {}",
          change.job_name, publish_duration, e
        );
        metrics.increment_errors();
        metrics.observe_publish_duration(publish_duration);
        Err(change)
      }
    }
  }

  async fn finalize_job_state(
    &self,
    active_job_context: &Option<(String, String)>,
    total_failed: usize,
  ) -> Result<(), AtomicDataError> {
    if let Some((job_name, query_name)) = active_job_context {
      if let Err(e) = self.database.mark_job_not_running(job_name, query_name).await {
        warn!("Failed to mark job '{}' as not running: {}", job_name, e);
      }

      if total_failed == 0 {
        if let Err(e) = self.database.mark_completed(job_name, query_name).await {
          warn!("Failed to mark job '{}' as completed: {}", job_name, e);
        }
      } else {
        warn!("Job '{}' had {} failed changes", job_name, total_failed);
      }
    }
    Ok(())
  }

  async fn health_check_loop(&self) {
    let mut interval = interval(Duration::from_secs(HEALTH_CHECK_INTERVAL_SECONDS));
    let mut shutdown_signal = self.shutdown_signal.clone();

    loop {
      tokio::select! {
          _ = interval.tick() => {
              if let Err(e) = self.health_check().await {
                  error!("Health check failed: {}", e);
              }
          }
          _ = shutdown_signal.changed() => {
              if *shutdown_signal.borrow() {
                  info!("Shutting down health check loop");
                  break;
              }
          }
      }
    }
  }

  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    if let Err(e) = self.database.health_check().await {
      error!("Database health check failed: {}", e);
      return Err(AtomicDataError::DatabaseError(e.to_string()));
    }

    if let Err(e) = self.publisher.health_check().await {
      error!("Publisher health check failed: {}", e);
      return Err(e);
    }

    debug!("Health check passed");
    Ok(())
  }
}

