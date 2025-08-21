use anyhow::Result;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

use crate::config::Settings;
use crate::database::{ChangeRecord, DatabaseClient};
use crate::errors::AtomicDataError;
use crate::ingestor::IngestorClient;
use crate::metrics::MetricsCollector;

#[derive(Debug)]
pub struct AtomicDataPublisher {
  database: Arc<DatabaseClient>,
  ingestor: Arc<IngestorClient>,
  metrics: Arc<MetricsCollector>,
  config: Settings,
  shutdown_signal: tokio::sync::watch::Receiver<bool>,
  shutdown_sender: tokio::sync::watch::Sender<bool>,
}

impl AtomicDataPublisher {
  pub async fn new(config: Settings) -> Result<Self> {
    info!("Initializing Atomic Data Publisher service");

    // Initialize database client
    let database =
      Arc::new(DatabaseClient::new(&config.database, config.service.watched_tables.clone()).await?);

    // Initialize tracking tables and triggers
    database.initialize_tracking().await?;

    // Initialize ingestor client
    let ingestor = Arc::new(IngestorClient::new(
      config.ingestor.clone(),
      config.service.watched_tables.clone(),
    )?);

    // Initialize metrics collector
    let metrics = Arc::new(MetricsCollector::new());

    // Create shutdown signal
    let (shutdown_sender, shutdown_signal) = tokio::sync::watch::channel(false);

    Ok(Self {
      database,
      ingestor,
      metrics,
      config,
      shutdown_signal,
      shutdown_sender,
    })
  }

  /// Start the service with all background tasks
  pub async fn run(&self) -> Result<()> {
    info!("Starting Atomic Data Publisher service");

    // Health check both database and ingestor before starting
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
                  metrics.log_metrics_summary().await;
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

    // Cleanup loop (run daily)
    let cleanup_handle = {
      let database = self.database.clone();
      let mut shutdown_signal = self.shutdown_signal.clone();
      tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(24 * 60 * 60)); // Daily
        loop {
          tokio::select! {
              _ = interval.tick() => {
                  if let Err(e) = database.cleanup_old_changes(7).await {
                      error!("Failed to cleanup old changes: {}", e);
                  }
              }
              _ = shutdown_signal.changed() => {
                  if *shutdown_signal.borrow() {
                      info!("Shutting down cleanup task");
                      break;
                  }
              }
          }
        }
      })
    };
    handles.push(cleanup_handle);

    // Health check loop
    let health_handle = {
      let service = self.clone();
      tokio::spawn(async move {
        service.health_check_loop().await;
      })
    };
    handles.push(health_handle);

    // Wait for shutdown signal or any task to complete
    tokio::select! {
        _ = self.shutdown_signal.changed() => {
            info!("Shutdown signal received");
        }
        result = futures::future::try_join_all(handles) => {
            match result {
                Ok(_) => info!("All tasks completed successfully"),
                Err(e) => error!("Task failed: {}", e),
            }
        }
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
              self.metrics.record_polling_cycle_time(cycle_time).await;

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

  /// Process pending changes from the database
  async fn process_changes(&self) -> Result<(), AtomicDataError> {
    let batch_start = Instant::now();

    // Get pending changes
    let query_start = Instant::now();
    let changes = self
      .database
      .get_pending_changes(self.config.service.batch_size)
      .await?;
    let query_time = query_start.elapsed();
    self.metrics.record_database_query(true, query_time).await;

    if changes.is_empty() {
      debug!("No pending changes found");
      return Ok(());
    }

    info!("Processing {} pending changes", changes.len());
    self
      .metrics
      .increment_changes_processed(changes.len() as u64);

    // Record per-table metrics
    for change in &changes {
      self
        .metrics
        .record_table_change_detected(&change.table_name)
        .await;
    }

    // Publish changes in batches to avoid overwhelming the ingestor
    let mut published_changes = Vec::new();
    let mut failed_changes = Vec::new();

    // Process changes with concurrency limit
    let semaphore = Arc::new(tokio::sync::Semaphore::new(
      self.config.service.max_concurrent_publishes as usize,
    ));
    let mut tasks = Vec::new();

    for change in changes {
      let ingestor = self.ingestor.clone();
      let metrics = self.metrics.clone();
      let semaphore = semaphore.clone();

      let task = tokio::spawn(async move {
        let _permit = semaphore.acquire().await.unwrap();
        let publish_start = Instant::now();

        let result = ingestor.publish_changes(vec![change.clone()]).await;
        let publish_time = publish_start.elapsed();

        match result {
          Ok(published_ids) if !published_ids.is_empty() => {
            metrics.record_ingestor_request(true, publish_time).await;
            metrics
              .record_table_change_published(&change.table_name, publish_time)
              .await;
            Ok(change)
          }
          Ok(_) => {
            metrics.record_ingestor_request(false, publish_time).await;
            metrics.record_table_error(&change.table_name).await;
            Err(change)
          }
          Err(e) => {
            error!(
              "Failed to publish change for {}/{}: {}",
              change.table_name, change.primary_key, e
            );
            metrics.record_ingestor_request(false, publish_time).await;
            metrics.record_table_error(&change.table_name).await;
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

    // Mark successfully published changes as processed
    if !published_changes.is_empty() {
      match self
        .database
        .mark_changes_processed(&published_changes)
        .await
      {
        Ok(_) => {
          info!("Marked {} changes as processed", published_changes.len());
          self
            .metrics
            .increment_changes_published(published_changes.len() as u64);
        }
        Err(e) => {
          error!("Failed to mark changes as processed: {}", e);
          self
            .metrics
            .record_database_query(false, Duration::from_millis(0))
            .await;
          return Err(AtomicDataError::DatabaseError(e.to_string()));
        }
      }
    }

    // Log summary
    let batch_time = batch_start.elapsed();
    self.metrics.record_batch_processing_time(batch_time).await;

    if !failed_changes.is_empty() {
      warn!(
        "Batch processing completed in {:?}: {} published, {} failed",
        batch_time,
        published_changes.len(),
        failed_changes.len()
      );
    } else {
      info!(
        "Batch processing completed in {:?}: {} published",
        batch_time,
        published_changes.len()
      );
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

    // Check ingestor service
    if let Err(e) = self.ingestor.health_check().await {
      error!("Ingestor health check failed: {}", e);
      return Err(e);
    }

    debug!("Health check passed");
    Ok(())
  }

  /// Get current service metrics
  pub async fn get_metrics(&self) -> crate::metrics::ServiceMetrics {
    let circuit_breaker_status = Some(self.ingestor.circuit_breaker_status());
    self.metrics.get_metrics(circuit_breaker_status).await
  }

  /// Gracefully shutdown the service
  pub async fn shutdown(&self) -> Result<()> {
    info!("Initiating graceful shutdown");

    // Send shutdown signal
    if let Err(e) = self.shutdown_sender.send(true) {
      warn!("Failed to send shutdown signal: {}", e);
    }

    // Give tasks time to complete
    sleep(Duration::from_secs(5)).await;

    info!("Shutdown completed");
    Ok(())
  }
}

impl Clone for AtomicDataPublisher {
  fn clone(&self) -> Self {
    Self {
      database: self.database.clone(),
      ingestor: self.ingestor.clone(),
      metrics: self.metrics.clone(),
      config: self.config.clone(),
      shutdown_signal: self.shutdown_signal.clone(),
      shutdown_sender: self.shutdown_sender.clone(),
    }
  }
}
