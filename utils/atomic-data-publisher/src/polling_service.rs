use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::{interval, sleep};
use tracing::{debug, error, info, warn};

use crate::config::Settings;
use crate::database::{DatabaseClient, ChangeRecord};
use crate::errors::AtomicDataError;
use crate::metrics::MetricsCollector;
use crate::publisher::AtomicDataPublisher as Publisher;

const POLLING_ERROR_RETRY_SECONDS: u64 = 5;

#[derive(Debug)]
pub struct PollingService {
  database: Arc<DatabaseClient>,
  publisher: Arc<Publisher>,
  metrics: Arc<MetricsCollector>,
  config: Settings,
}

impl PollingService {
  pub fn new(
    database: Arc<DatabaseClient>,
    publisher: Arc<Publisher>,
    metrics: Arc<MetricsCollector>,
    config: Settings,
  ) -> Self {
    Self {
      database,
      publisher,
      metrics,
      config,
    }
  }

  pub async fn run(
    &self,
    mut shutdown_signal: tokio::sync::watch::Receiver<bool>,
  ) -> Result<(), AtomicDataError> {
    let mut interval = interval(self.config.polling_interval());

    info!(
      "Starting polling service with interval: {:?}",
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
                  info!("Shutting down polling service");
                  break;
              }
          }
      }
    }

    Ok(())
  }

  async fn process_changes(&self) -> Result<(), AtomicDataError> {
    if self.database.any_job_running().await? {
      debug!("Job already running, skipping to prevent OOM");
      return Ok(());
    }

    let mut total_jobs_processed = 0;
    let mut total_jobs_with_data = 0;
    let mut total_changes_published = 0;
    let mut total_changes_failed = 0;

    info!("Starting new polling cycle - processing all available jobs");

    // Process all available jobs in this cycle
    loop {
      let change_record = self
        .database
        .get_pending_changes()
        .await?;

      let record = match change_record {
        Some(record) => record,
        None => {
          info!(
            "Completed polling cycle: {} jobs processed ({} had data), {} total individual changes published, {} total failed",
            total_jobs_processed, total_jobs_with_data, total_changes_published, total_changes_failed
          );
          break;
        }
      };

      total_jobs_processed += 1;
      total_jobs_with_data += 1; // If we got a record, it has data
      let job_name = record.job_name.clone(); // Clone the job name to avoid borrow issues

      let row_count = if let serde_json::Value::Array(arr) = &record.atomic_data {
        arr.len()
      } else {
        1
      };

      info!(
        "Processing job {} of cycle: '{}' with {} rows (batches of {})",
        total_jobs_processed,
        job_name,
        row_count,
        self.config.service.batch_size
      );

      let (job_published, job_failed, should_break) = self
        .process_job_changes(record)
        .await?;
      total_changes_published += job_published;
      total_changes_failed += job_failed;

      info!("Completed job '{}': {} individual changes published, {} failed", job_name, job_published, job_failed);

      if should_break {
        break;
      }
    }

    if total_jobs_processed == 0 {
      debug!("No jobs had data in this cycle - all jobs up to date");
    }

    Ok(())
  }

  async fn process_job_changes(
    &self,
    record: crate::database::ChangeRecord,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let changes = vec![record.clone()];

    let (total_published, total_failed, should_break) = self.process_batches(changes, record.target_block).await?;
    self.database.finalize_job(&record, total_failed).await?;
    Ok((total_published, total_failed, should_break))
  }

  async fn process_batches(
    &self,
    changes: Vec<ChangeRecord>,
    target_block: u64,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_failed = 0;
    let batch_size = self.config.service.batch_size as usize;

    for (batch_index, batch) in changes.chunks(batch_size).enumerate() {
      let total_atomic_items: usize = batch.iter()
        .map(|change| {
          if let serde_json::Value::Array(arr) = &change.atomic_data {
            arr.len()
          } else {
            1
          }
        })
        .sum();

      info!("Processing batch {}: {} ChangeRecords ({} individual atomic items)", batch_index + 1, batch.len(), total_atomic_items);
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
    batch: &[ChangeRecord],
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

    // Calculate total individual changes published by looking at the atomic_data arrays
    let total_individual_changes: usize = published_changes.iter()
      .map(|change| {
        if let serde_json::Value::Array(arr) = &change.atomic_data {
          arr.len()
        } else {
          1
        }
      })
      .sum();

    let batch_time = batch_start.elapsed();
    info!(
      "Batch completed in {:?}: {} ChangeRecords ({} individual changes) published, {} failed",
      batch_time, batch_published, total_individual_changes, batch_failed
    );

    Ok((total_individual_changes, batch_failed))
  }

  async fn publish_single_change(
    change: ChangeRecord,
    publisher: Arc<Publisher>,
    metrics: Arc<MetricsCollector>,
    semaphore: Arc<tokio::sync::Semaphore>,
  ) -> Result<ChangeRecord, ChangeRecord> {
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
        // Increment metrics for each individual change published
        for _ in 0..published_ids.len() {
          metrics.increment_published();
        }
        metrics.observe_publish_duration(publish_duration);
        info!("Published {} individual changes for job '{}'", published_ids.len(), change.job_name);
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

}
