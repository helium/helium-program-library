use std::{
  sync::Arc,
  time::{Duration, Instant},
};

use tokio::time::sleep;
use tracing::{debug, error, info, warn};
use triggered::Listener;

use crate::{
  config::Settings,
  database::{ChangeRecord, DatabaseClient},
  errors::AtomicDataError,
  metrics,
  publisher::AtomicDataPublisher as Publisher,
};

const POLLING_ERROR_RETRY_SECONDS: u64 = 5;

#[derive(Debug, Clone)]
pub struct PollingService {
  database: Arc<DatabaseClient>,
  publisher: Arc<Publisher>,
  config: Settings,
}

impl PollingService {
  pub fn new(database: Arc<DatabaseClient>, publisher: Arc<Publisher>, config: Settings) -> Self {
    Self {
      database,
      publisher,
      config,
    }
  }

  pub async fn run(&self, shutdown_listener: Listener) -> Result<(), AtomicDataError> {
    let polling_interval = self.config.polling_interval();

    info!(
      "Starting polling service with interval: {:?}",
      polling_interval
    );

    loop {
      let cycle_start = Instant::now();

      tokio::select! {
          _ = async {
              if let Err(e) = self.process_changes(shutdown_listener.clone()).await {
                  error!("Error processing changes: {}", e);
                  metrics::increment_errors();
                  sleep(Duration::from_secs(POLLING_ERROR_RETRY_SECONDS)).await;
              }

              let cycle_time = cycle_start.elapsed();
              debug!("Polling cycle completed in {:?}", cycle_time);

              // Wait for the full interval after completing the cycle
              sleep(polling_interval).await;
          } => {},
          _ = shutdown_listener.clone() => {
              info!("Shutting down polling service");
              break;
          }
      }
    }

    Ok(())
  }

  async fn process_changes(&self, shutdown_listener: Listener) -> Result<(), AtomicDataError> {
    if self.database.any_job_running().await? {
      debug!("Job already running, skipping to prevent OOM");
      return Ok(());
    }

    let mut total_jobs_processed = 0;
    let mut total_jobs_with_data = 0;
    let mut total_changes_published = 0;
    let mut total_changes_failed = 0;

    info!("Starting new polling cycle - processing all available jobs");

    loop {
      let change_records = self.database.get_pending_changes().await?;

      if change_records.is_empty() {
        info!(
          "Completed polling cycle: {} jobs processed ({} had data), {} total individual changes published, {} total failed",
          total_jobs_processed, total_jobs_with_data, total_changes_published, total_changes_failed
        );
        break;
      }

      total_jobs_processed += 1;
      total_jobs_with_data += 1;
      let item_count = change_records.len();
      let job_name = change_records[0].job_name.clone();
      let query_name = change_records[0].query_name.clone();
      let target_block = change_records[0].target_block;

      info!(
        "Processing job '{}' with {} items (target block: {})",
        job_name, item_count, target_block
      );

      match self.process_job(&change_records, shutdown_listener.clone()).await {
        Ok((job_published, job_failed, has_failures)) => {
          total_changes_published += job_published;
          total_changes_failed += job_failed;

          if let Err(e) = self.database.finalize_job(&change_records[0], job_failed).await {
            error!("Failed to finalize job '{}': {}", job_name, e);
            let _ = self.database.mark_job_not_running(&job_name, &query_name).await;
            continue;
          }

          info!(
            "Completed job '{}': {} individual changes published, {} failed",
            job_name, job_published, job_failed
          );

          if has_failures {
            // Mark as not running to allow retry on next cycle
            let _ = self.database.mark_job_not_running(&job_name, &query_name).await;
            return Ok(());
          }
        }
        Err(e) => {
          error!("Job '{}' failed: {}", job_name, e);
          let _ = self.database.mark_job_not_running(&job_name, &query_name).await;
          continue;
        }
      }
    }

    if total_jobs_processed == 0 {
      debug!("No jobs had data in this cycle - all jobs up to date");
    }

    Ok(())
  }

  async fn process_job(
    &self,
    records: &[ChangeRecord],
    shutdown_listener: Listener,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_failed = 0;
    let mut published_batch = Vec::with_capacity(crate::database::BATCH_SIZE);
    let total_items = records.len();

    info!("Processing {} atomic items", total_items);

    for (item_index, record) in records.iter().enumerate() {
      if shutdown_listener.is_triggered() {
        warn!(
          "Shutdown signal received during processing, stopping at item {}/{}",
          item_index + 1,
          total_items
        );
        return Ok((total_published, total_failed, true));
      }

      let should_log = if total_items >= 10000 {
        let log_interval = total_items / 10;
        (item_index + 1) % log_interval == 0 || (item_index + 1) == total_items
      } else if total_items >= 1000 {
        (item_index + 1) % 1000 == 0 || (item_index + 1) == total_items
      } else if total_items >= 100 {
        (item_index + 1) % 100 == 0 || (item_index + 1) == total_items
      } else {
        (item_index + 1) == total_items
      };

      if should_log {
        info!(
          "Progress: {}/{} items ({:.1}%) - {} published, {} failed",
          item_index + 1,
          total_items,
          (item_index + 1) as f64 / total_items as f64 * 100.0,
          total_published,
          total_failed
        );
      }

      match self
        .process_single_item(record, shutdown_listener.clone())
        .await
      {
        Ok(Some(published_change)) => {
          total_published += 1;
          published_batch.push(published_change);

          // Clear batch periodically to free memory (checkpoint only at end)
          if published_batch.len() >= crate::database::BATCH_SIZE {
            debug!("Clearing batch of {} items to free memory", published_batch.len());
            published_batch.clear();
            published_batch.shrink_to(crate::database::BATCH_SIZE);
          }
        }
        Ok(None) => {
          total_failed += 1;
        }
        Err(e) => {
          error!("Unexpected error processing item {}: {}", item_index + 1, e);
          total_failed += 1;
        }
      }
    }

    info!(
      "Completed processing all items: {} published, {} failed",
      total_published, total_failed
    );

    let has_failures = total_failed > 0;

    // Only checkpoint progress when all items successfully processed
    if !has_failures && total_published > 0 {
      self
        .database
        .mark_processed(&records[0..1], records[0].target_block)
        .await?;
      info!(
        "Marked all {} items as processed up to block {}",
        total_published, records[0].target_block
      );
    } else if has_failures {
      warn!(
        "Skipping block advancement due to {} failed items - job will retry same data on next cycle",
        total_failed
      );
    }

    Ok((total_published, total_failed, has_failures))
  }

  async fn process_single_item(
    &self,
    record: &ChangeRecord,
    shutdown_listener: Listener,
  ) -> Result<Option<ChangeRecord>, AtomicDataError> {
    if shutdown_listener.is_triggered() {
      return Ok(None);
    }

    let request = match self.publisher.prepare_change(record).await {
      Ok(req) => req,
      Err(e) => {
        error!("Failed to prepare change request for item: {}", e);
        metrics::increment_protobuf_build_failures();
        return Ok(None);
      }
    };

    let publish_start = Instant::now();
    let result = tokio::select! {
      result = self.publisher.publish_change_request(request) => result,
      _ = shutdown_listener.clone() => {
        warn!("Shutdown signal received during item publishing");
        return Ok(None);
      }
    };

    let publish_duration = publish_start.elapsed().as_secs_f64();

    match result {
      Ok(()) => {
        metrics::increment_published();
        metrics::observe_publish_duration(publish_duration);
        debug!("Successfully published change (duration: {:.2}s)", publish_duration);
        Ok(Some(record.clone()))
      }
      Err(e) => {
        error!(
          "Failed to publish change for job '{}' (duration: {:.2}s): {}",
          record.job_name, publish_duration, e
        );
        metrics::increment_errors();
        metrics::observe_publish_duration(publish_duration);
        Ok(None)
      }
    }
  }

  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    // Check if we can access the database for polling operations
    if let Err(e) = self.database.health_check().await {
      return Err(AtomicDataError::DatabaseError(e));
    }

    // Check if we can access the publisher
    self.publisher.health_check().await?;

    // Verify polling configuration is valid
    if self.config.service.polling_jobs.is_empty() {
      return Err(AtomicDataError::ConfigError(config::ConfigError::Message(
        "No polling jobs configured".to_string(),
      )));
    }

    debug!("Polling service health check passed");
    Ok(())
  }
}
