use anyhow::Result;
use helium_crypto::{KeyTag, KeyType, Keypair, Network};
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
  /// Validate required tables exist
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

  /// Initialize database
  async fn init_database(database: &DatabaseClient, service_config: &ServiceConfig) -> Result<()> {
    database.create_state_table().await?;

    if service_config.polling_jobs.is_empty() {
      warn!("No polling jobs configured");
    }
    Ok(())
  }

  pub async fn new(config: Settings) -> Result<Self> {
    info!("Initializing Atomic Data Publisher service");

    // Initialize Solana RPC client first
    let solana_client = Arc::new(SolanaClientWrapper::new(config.solana.clone())?);

    // Get initial Solana block height
    let initial_block_height = solana_client
      .get_current_block_height()
      .await
      .map_err(|e| anyhow::anyhow!("Failed to get initial Solana block height: {}", e))?;
    let current_solana_block_height = Arc::new(tokio::sync::RwLock::new(initial_block_height));

    // Initialize database client
    let database =
      Arc::new(DatabaseClient::new(&config.database, config.service.polling_jobs.clone()).await?);

    // Validate required tables exist
    Self::validate_tables(&database, &config.database.required_tables).await?;

    // Initialize database
    Self::init_database(&database, &config.service).await?;

    // Initialize polling state for all configured jobs
    database.init_polling_state().await?;

    // Cleanup any stale running states from previous runs
    database.cleanup_stale_jobs().await?;

    // Create performance indexes for better query performance
    if let Err(e) = database.create_performance_indexes().await {
      warn!(
        "Failed to create performance indexes (this is non-fatal): {}",
        e
      );
    }

    // Load keypair for signing messages
    let keypair_path = std::env::var("ATOMIC_DATA_PUBLISHER_SIGNING_KEYPAIR_PATH")
      .unwrap_or_else(|_| "./keypair.bin".to_string());

    let key_tag = KeyTag {
      network: Network::MainNet,
      key_type: KeyType::Ed25519,
    };

    // For now, always generate a new keypair using entropy
    // Load keypair from file or environment
    let entropy = if std::path::Path::new(&keypair_path).exists() {
      std::fs::read(&keypair_path)?
    } else {
      warn!(
        "Keypair file not found at {}, generating new entropy",
        keypair_path
      );
      let mut entropy = vec![0u8; 32];
      use rand::RngCore;
      rand::thread_rng().fill_bytes(&mut entropy);
      std::fs::write(&keypair_path, &entropy)
        .map_err(|e| anyhow::anyhow!("Failed to save entropy: {}", e))?;
      info!("Generated new entropy and saved to {}", keypair_path);
      entropy
    };

    let keypair = Keypair::generate_from_entropy(key_tag, &entropy)
      .map_err(|e| anyhow::anyhow!("Failed to generate keypair from entropy: {}", e))?;

    info!("Using keypair with public key: {}", keypair.public_key());

    // Initialize publisher client
    let publisher = Arc::new(Publisher::new(config.service.polling_jobs.clone(), keypair).await?);

    // Initialize metrics collector
    let metrics = Arc::new(MetricsCollector::new());

    // Create shutdown signal
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

  /// Start the service
  pub async fn run(&self) -> Result<()> {
    self.health_check().await?;

    let mut handles = Vec::new();

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
        let mut interval = interval(Duration::from_secs(60)); // Report every minute
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

    // Clean up ALL running job states in the database before stopping
    if let Err(e) = self.database.cleanup_all_jobs().await {
      warn!(
        "Failed to clean up running job states during shutdown: {}",
        e
      );
    }

    info!("Atomic Data Publisher service stopped");
    Ok(())
  }

  /// Main polling loop that detects changes and publishes them
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

                  // Back off on errors to avoid overwhelming the system
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

  /// Process pending changes
  async fn process_changes(&self) -> Result<(), AtomicDataError> {
    if self.database.any_job_running().await? {
      debug!("Job already running, skipping to prevent OOM");
      return Ok(());
    }

    // Get current Solana block height just-in-time (only when we're about to process)
    let current_solana_height = match self.solana_client.get_current_block_height().await {
      Ok(height) => {
        // Update our cached height for other components that might need it
        {
          let mut cached_height = self.current_solana_block_height.write().await;
          if *cached_height != height {
            debug!(
              "Updated Solana block height from {} to {} (just-in-time)",
              *cached_height, height
            );
            *cached_height = height;
          }
        }
        height
      }
      Err(e) => {
        error!(
          "Failed to get current Solana block height just-in-time: {}",
          e
        );
        // Fall back to cached height as emergency measure
        let height = self.current_solana_block_height.read().await;
        warn!(
          "Using cached Solana block height {} due to RPC failure",
          *height
        );
        *height
      }
    };

    // Get pending changes from polling jobs (this now includes the full lifecycle protection)
    let query_start = Instant::now();
    let changes_and_job = self
      .database
      .get_pending_changes(current_solana_height)
      .await?;
    let _query_time = query_start.elapsed();

    let (changes, active_job_context) = match changes_and_job {
      Some((changes, job_context)) => (changes, Some(job_context)),
      None => {
        debug!("No pending changes found or no jobs available");
        return Ok(());
      }
    };

    if changes.is_empty() {
      debug!("No pending changes found");
      // Still need to clean up the running state for the job
      if let Some((job_name, query_name)) = active_job_context {
        self
          .database
          .mark_job_not_running(&job_name, &query_name)
          .await?;
        self.database.mark_completed(&job_name, &query_name).await?;
      }
      return Ok(());
    }

    info!(
      "Processing {} pending changes in batches of {}",
      changes.len(),
      self.config.service.batch_size
    );

    // Process all changes in batches (job remains marked as running during this phase)
    let mut total_published = 0;
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

      // Process each change in the batch

      // Process batch with concurrency limit
      let semaphore = Arc::new(tokio::sync::Semaphore::new(
        self.config.service.max_concurrent_publishes as usize,
      ));
      let mut tasks = Vec::new();

      for change in batch {
        let change = change.clone(); // Clone the change record for the async task
        let publisher = self.publisher.clone();
        let metrics = self.metrics.clone();
        let semaphore = semaphore.clone();

        let task = tokio::spawn(async move {
          let _permit = semaphore.acquire().await.unwrap();
          let result = publisher.publish_changes(vec![change.clone()]).await;

          match result {
            Ok(published_ids) if !published_ids.is_empty() => {
              metrics.increment_published();
              Ok(change)
            }
            Ok(_) => {
              metrics.increment_errors();
              Err(change)
            }
            Err(e) => {
              error!(
                "Failed to publish change for job '{}': {}",
                change.job_name, e
              );
              metrics.increment_errors();
              Err(change)
            }
          }
        });

        tasks.push(task);
      }

      // Wait for all publishing tasks to complete
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

      // Mark successfully published changes as processed (update polling state)
      if !published_changes.is_empty() {
        match self
          .database
          .mark_processed(&published_changes, current_solana_height)
          .await
        {
          Ok(_) => {
            total_published += published_changes.len();
            let batch_time = batch_start.elapsed();
            info!(
              "Batch processing completed in {:?}: {} published, {} failed",
              batch_time,
              published_changes.len(),
              failed_changes.len()
            );
          }
          Err(e) => {
            error!("Failed to mark batch changes as processed: {}", e);
            self.metrics.increment_errors();

            // Clean up job state on error
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
      }

      if !failed_changes.is_empty() {
        warn!("Batch had {} failed changes", failed_changes.len());
      }
    }

    info!(
      "Completed processing all batches: {} total changes published",
      total_published
    );

    // Mark the job as not running and completed in queue after all processing is done
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
      if let Err(e) = self.database.mark_completed(&job_name, &query_name).await {
        warn!(
          "Failed to mark job '{}' query '{}' as completed after processing: {}",
          job_name, query_name, e
        );
      }
    }

    Ok(())
  }

  /// Health check loop
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

  /// Perform health checks on all components
  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    // Check database connectivity
    if let Err(e) = self.database.health_check().await {
      error!("Database health check failed: {}", e);
      return Err(AtomicDataError::DatabaseError(e.to_string()));
    }

    // Check publisher service
    if let Err(e) = self.publisher.health_check().await {
      error!("Publisher health check failed: {}", e);
      return Err(e);
    }

    // Check Solana RPC connectivity
    if let Err(e) = self.solana_client.health_check().await {
      error!("Solana RPC health check failed: {}", e);
      return Err(e);
    }

    debug!("Health check passed");
    Ok(())
  }
}
