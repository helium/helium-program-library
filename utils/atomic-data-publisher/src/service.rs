use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

use crate::config::{ServiceConfig, Settings};
use crate::database::DatabaseClient;
use crate::errors::AtomicDataError;
use crate::metrics::MetricsCollector;
use crate::publisher::AtomicDataPublisher as Publisher;
use crate::solana::SolanaClientWrapper;

#[derive(Debug, Clone)]
pub struct AtomicDataPublisher {
  database: Arc<DatabaseClient>,
  publisher: Arc<Publisher>,
  solana_client: Arc<SolanaClientWrapper>,
  metrics: Arc<MetricsCollector>,
  config: Settings,
  current_solana_block_height: Arc<tokio::sync::RwLock<u64>>,
  shutdown_signal: tokio::sync::watch::Receiver<bool>,
  pub shutdown_sender: tokio::sync::watch::Sender<bool>,
}

impl AtomicDataPublisher {
  async fn validate_tables(database: &DatabaseClient, tables: &[String]) -> Result<()> {
    for table_name in tables {
      if !database.table_exists(table_name).await? {
        return Err(anyhow::anyhow!(
          "Required table '{}' does not exist",
          table_name
        ));
      }
    }
    Ok(())
  }

  async fn init_database(database: &DatabaseClient, service_config: &ServiceConfig) -> Result<()> {
    database.create_state_table().await?;

    if service_config.polling_jobs.is_empty() {
      warn!("No polling jobs configured");
    }
    Ok(())
  }

  pub async fn new(config: Settings) -> Result<Self> {
    info!("Initializing Atomic Data Publisher service");
    let solana_client = Arc::new(SolanaClientWrapper::new(config.solana.clone())?);
    let initial_block_height = solana_client
      .get_current_block_height()
      .await
      .map_err(|e| anyhow::anyhow!("Failed to get initial Solana block height: {}", e))?;
    let current_solana_block_height = Arc::new(tokio::sync::RwLock::new(initial_block_height));


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
      return Err(anyhow::anyhow!(
        "Keypair file not found at {}. Please provide a valid keypair file.",
        keypair_path
      ));
    };

    let keypair = Keypair::try_from(&keypair_data[..])
      .map_err(|e| anyhow::anyhow!("Failed to load keypair from file: {}", e))?;

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
      solana_client,
      metrics,
      config,
      current_solana_block_height,
      shutdown_signal,
      shutdown_sender,
    })
  }

  pub async fn run(&self) -> Result<()> {
    self.health_check().await?;
    let mut handles = Vec::new();
    let metrics_bind_addr = format!("0.0.0.0:{}", self.config.service.port);
    let metrics_handle = {
      let metrics = self.metrics.clone();
      let shutdown_signal = self.shutdown_signal.clone();
      let bind_addr = metrics_bind_addr.clone();
      tokio::spawn(async move {
        if let Err(e) = metrics.serve_metrics(&bind_addr, shutdown_signal).await {
          error!("Metrics server error: {}", e);
        }
      })
    };
    handles.push(metrics_handle);
    info!("Metrics server started on {}", metrics_bind_addr);

    // Main polling loop
    let polling_handle = {
      let service = self.clone();
      tokio::spawn(async move {
        service.polling_loop().await;
      })
    };
    handles.push(polling_handle);

    // Metrics reporting loop
    let metrics_handle = {
      let metrics = self.metrics.clone();
      let mut shutdown_signal = self.shutdown_signal.clone();
      tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(120)); // Report every 2 minutes
        loop {
          tokio::select! {
            _ = interval.tick() => {
                metrics.log_metrics_summary();
            }
              _ = shutdown_signal.changed() => {
                  if *shutdown_signal.borrow() {
                      info!("Shutting down metrics reporting");
                      break;
                  }
              }
          }
        }
      })
    };
    handles.push(metrics_handle);

    // Health check loop
    let health_handle = {
      let service = self.clone();
      tokio::spawn(async move {
        service.health_check_loop().await;
      })
    };

    handles.push(health_handle);

    // Wait for shutdown signal or any task to complete
    let mut shutdown_signal = self.shutdown_signal.clone();
    tokio::select! {
        _ = shutdown_signal.changed() => {
            info!("Shutdown signal received");
        }
        result = futures::future::try_join_all(handles) => {
            match result {
                Ok(_) => info!("All tasks completed successfully"),
                Err(e) => error!("Task failed: {}", e),
            }
        }
    }

    if let Err(e) = self.database.cleanup_all_jobs().await {
      warn!(
        "Failed to clean up running job states during shutdown: {}",
        e
      );
    }

    info!("Atomic Data Publisher service stopped");
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
                  sleep(Duration::from_secs(5)).await;
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

    let current_solana_height = match self.solana_client.get_current_block_height().await {
      Ok(height) => {
        {
          let mut cached_height = self.current_solana_block_height.write().await;
          if *cached_height != height {
            debug!(
              "Updated Solana block height from {} to {} (cycle start)",
              *cached_height, height
            );
            *cached_height = height;
          }
        }
        height
      }
      Err(e) => {
        error!("Failed to get current Solana block height: {}", e);
        // Fall back to cached height as emergency measure
        let height = self.current_solana_block_height.read().await;
        warn!(
          "Using cached Solana block height {} due to RPC failure",
          *height
        );
        *height
      }
    };

    let mut total_jobs_processed = 0;
    let mut total_changes_published = 0;
    let mut total_changes_failed = 0;

    loop {
      let changes_and_job = self
        .database
        .get_pending_changes(current_solana_height)
        .await?;

      let (changes, active_job_context, target_height) = match changes_and_job {
        Some((changes, job_context, target_height)) => (changes, Some(job_context), target_height),
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
          job_name, target_height
        );
        if let Some((job_name, query_name)) = active_job_context {
          let empty_changes = vec![];
          self
            .database
            .mark_processed(&empty_changes, target_height)
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
        .process_job_changes(changes, active_job_context, target_height)
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
    target_height: u64,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_failed = 0;
    let batch_size = self.config.service.batch_size as usize;

    for (batch_index, batch) in changes.chunks(batch_size).enumerate() {
      info!(
        "Processing batch {}: {} changes",
        batch_index + 1,
        batch.len()
      );

      let batch_start = Instant::now();
      let mut published_changes = Vec::new();
      let mut failed_changes = Vec::new();
      let semaphore = Arc::new(tokio::sync::Semaphore::new(
        self.config.service.max_concurrent_publishes as usize,
      ));
      let mut tasks = Vec::new();

      for change in batch {
        let change = change.clone();
        let publisher = self.publisher.clone();
        let metrics = self.metrics.clone();
        let semaphore = semaphore.clone();

        let task = tokio::spawn(async move {
          let _permit = semaphore.acquire().await.unwrap();
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
                "Failed to publish change for job '{}': {}",
                change.job_name, e
              );
              metrics.increment_errors();
              metrics.observe_publish_duration(publish_duration);
              Err(change)
            }
          }
        });

        tasks.push(task);
      }

      for task in tasks {
        match task.await {
          Ok(Ok(change)) => published_changes.push(change),
          Ok(Err(change)) => failed_changes.push(change),
          Err(e) => {
            error!("Publishing task panicked: {}", e);
            self.metrics.increment_errors();
          }
        }
      }

      total_failed += failed_changes.len();
      if failed_changes.is_empty() && !published_changes.is_empty() {
        match self
          .database
          .mark_processed(&published_changes, target_height)
          .await
        {
          Ok(_) => {
            total_published += published_changes.len();
            let batch_time = batch_start.elapsed();
            info!(
              "Batch processing completed in {:?}: {} published, 0 failed. Advanced to block height {}",
              batch_time,
              published_changes.len(),
              target_height
            );
          }
          Err(e) => {
            error!("Failed to mark batch changes as processed: {}", e);
            self.metrics.increment_errors();
            if let Some((job_name, query_name)) = &active_job_context {
              if let Err(cleanup_err) = self
                .database
                .mark_job_not_running(job_name, query_name)
                .await
              {
                warn!(
                  "Failed to mark job '{}' query '{}' as not running after error: {}",
                  job_name, query_name, cleanup_err
                );
              }
            }
            return Err(AtomicDataError::DatabaseError(e.to_string()));
          }
        }
      } else if !failed_changes.is_empty() {
        // Some or all changes failed - do not advance block height, retry same range next poll
        let batch_time = batch_start.elapsed();
        warn!(
          "Batch processing completed in {:?}: {} published, {} failed. Not advancing block height - will retry same range",
          batch_time,
          published_changes.len(),
          failed_changes.len()
        );
      }
    }

    info!(
      "Completed processing all batches: {} total changes published, {} total failed",
      total_published, total_failed
    );

    // Mark the job as not running and completed in queue after all processing is done
    // Only mark as completed if there were no failures or if we processed everything successfully
    if let Some((job_name, query_name)) = active_job_context {
      if let Err(e) = self
        .database
        .mark_job_not_running(&job_name, &query_name)
        .await
      {
        warn!(
          "Failed to mark job '{}' query '{}' as not running after processing: {}",
          job_name, query_name, e
        );
      }

      if total_failed == 0 {
        if let Err(e) = self.database.mark_completed(&job_name, &query_name).await {
          warn!(
            "Failed to mark job '{}' query '{}' as completed after processing: {}",
            job_name, query_name, e
          );
        }
      } else {
        warn!(
          "Job '{}' query '{}' had {} failed changes",
          job_name, query_name, total_failed
        );

        return Ok((total_published, total_failed, true));
      }
    }

    Ok((total_published, total_failed, false))
  }

  async fn health_check_loop(&self) {
    let mut interval = interval(Duration::from_secs(30)); // Check every 30 seconds
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

    if let Err(e) = self.solana_client.health_check().await {
      error!("Solana RPC health check failed: {}", e);
      return Err(e);
    }

    debug!("Health check passed");
    Ok(())
  }
}
