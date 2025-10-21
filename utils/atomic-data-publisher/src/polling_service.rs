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

      for record in change_records {
        total_jobs_processed += 1;
        total_jobs_with_data += 1;
        let item_count = record.atomic_data.len();
        let job_name = record.job_name.clone();
        let query_name = record.query_name.clone();
        let target_block = record.target_block;

        info!(
          "Processing job '{}' with {} items (target block: {})",
          job_name, item_count, target_block
        );

        match self.process_job(&record, shutdown_listener.clone()).await {
          Ok((job_published, job_failed, has_failures)) => {
            total_changes_published += job_published;
            total_changes_failed += job_failed;

            if let Err(e) = self.database.finalize_job(&record, job_failed).await {
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
    }

    if total_jobs_processed == 0 {
      debug!("No jobs had data in this cycle - all jobs up to date");
    }

    Ok(())
  }

  async fn process_job(
    &self,
    job: &ChangeRecord,
    shutdown_listener: Listener,
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_failed = 0;
    let mut all_published_changes = Vec::new();
    let total_items = job.atomic_data.len();

    info!("Processing {} atomic items", total_items);

    for (item_index, atomic_item) in job.atomic_data.iter().enumerate() {
      // Check for shutdown signal before processing each item
      if shutdown_listener.is_triggered() {
        warn!(
          "Shutdown signal received during processing, stopping at item {}/{}",
          item_index + 1,
          total_items
        );
        return Ok((total_published, total_failed, true)); // has_failures = true to prevent block advancement
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
        .process_single_item(job, atomic_item, shutdown_listener.clone())
        .await
      {
        Ok(Some(published_change)) => {
          total_published += 1;
          all_published_changes.push(published_change);
        }
        Ok(None) => {
          // Item failed, but we continue processing
          total_failed += 1;
        }
        Err(e) => {
          // Unexpected error, log and continue
          error!("Unexpected error processing item {}: {}", item_index + 1, e);
          total_failed += 1;
        }
      }
    }

    info!(
      "Completed processing all items: {} published, {} failed",
      total_published, total_failed
    );

    // Return has_failures = true if any items failed
    // This blocks progress and requires manual intervention to fix bad data
    let has_failures = total_failed > 0;

    // Only advance the block if there were NO failures
    // If there are failures, don't advance so the same data will be retried
    if !has_failures && !all_published_changes.is_empty() {
      self
        .database
        .mark_processed(&all_published_changes, job.target_block)
        .await?;
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
    job: &ChangeRecord,
    atomic_item: &serde_json::Value,
    shutdown_listener: Listener,
  ) -> Result<Option<ChangeRecord>, AtomicDataError> {
    // Check for shutdown signal
    if shutdown_listener.is_triggered() {
      return Ok(None);
    }

    // Create a single-item record for this item
    let item_record = ChangeRecord {
      job_name: job.job_name.clone(),
      query_name: job.query_name.clone(),
      target_block: job.target_block,
      atomic_data: vec![atomic_item.clone()],
    };

    // Prepare the protobuf request for this single item
    let change_requests = match self.publisher.prepare_changes_batch(&item_record).await {
      Ok(requests) => requests,
      Err(e) => {
        error!("Failed to prepare change request for item: {}", e);
        metrics::increment_protobuf_build_failures();
        return Ok(None); // Failed to prepare, return None
      }
    };

    // Should have exactly one request
    if change_requests.len() != 1 {
      error!(
        "Expected 1 change request but got {} for job '{}'",
        change_requests.len(),
        job.job_name
      );
      return Ok(None);
    }

    let request = change_requests.into_iter().next().unwrap();

    // Publish the change with retries
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
        Ok(Some(ChangeRecord {
          job_name: job.job_name.clone(),
          query_name: job.query_name.clone(),
          target_block: job.target_block,
          atomic_data: vec![atomic_item.clone()],
        }))
      }
      Err(e) => {
        error!(
          "Failed to publish change for job '{}' (duration: {:.2}s): {}",
          job.job_name, publish_duration, e
        );
        metrics::increment_errors();
        metrics::observe_publish_duration(publish_duration);
        Ok(None) // Failed to publish, return None
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
