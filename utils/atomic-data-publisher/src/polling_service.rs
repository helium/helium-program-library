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

enum ProcessResult {
  Published(ChangeRecord),
  DataError,      // Bad data - permanently failed, logged to DB
  PublishError,   // Transient infrastructure error - retry next cycle
}

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

  fn should_log_progress(item_index: usize, total_items: usize) -> bool {
    let current = item_index + 1;
    let is_last = current == total_items;

    if is_last {
      return true;
    }

    if total_items >= 10000 {
      current % (total_items / 10) == 0
    } else if total_items >= 1000 {
      current % 1000 == 0
    } else if total_items >= 100 {
      current % 100 == 0
    } else {
      false
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
    match self.database.any_job_running().await {
      Ok(is_running) if is_running => {
        debug!("Job already running, skipping to prevent OOM");
        return Ok(());
      }
      Ok(_) => {}
      Err(e) => {
        // Check if this is an auth error and attempt pool refresh
        if let Some(sqlx_err) = e.downcast_ref::<sqlx::Error>() {
          if DatabaseClient::is_auth_error(sqlx_err) {
            warn!("Database authentication error detected, attempting pool refresh");
            if let Err(refresh_err) = self.database.refresh_pool().await {
              error!("Failed to refresh database pool: {}", refresh_err);
            } else {
              info!("Database pool refreshed successfully after auth error");
            }
          }
        }
        return Err(e.into());
      }
    }

    let mut total_jobs_processed = 0;
    let mut total_jobs_with_data = 0;
    let mut total_changes_published = 0;
    let mut total_changes_failed = 0;

    info!("Starting new polling cycle - processing all available jobs");

    loop {
      let change_records = match self.database.get_pending_changes().await {
        Ok(records) => records,
        Err(e) => {
          // Check if this is an auth error and attempt pool refresh
          if let Some(sqlx_err) = e.downcast_ref::<sqlx::Error>() {
            if DatabaseClient::is_auth_error(sqlx_err) {
              warn!("Database authentication error detected, attempting pool refresh");
              if let Err(refresh_err) = self.database.refresh_pool().await {
                error!("Failed to refresh database pool: {}", refresh_err);
              } else {
                info!("Database pool refreshed successfully after auth error");
              }
            }
          }
          return Err(e.into());
        }
      };

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
        Ok((job_published, job_data_errors, job_publish_errors, was_interrupted)) => {
          total_changes_published += job_published;
          total_changes_failed += job_data_errors + job_publish_errors;

          // Only pass publish errors to finalize_job (data errors are logged and don't block)
          if let Err(e) = self.database.finalize_job(&change_records[0], job_publish_errors).await {
            error!("Failed to finalize job '{}': {}", job_name, e);
            let _ = self.database.mark_job_not_running(&job_name, &query_name).await;
            continue;
          }

          if job_data_errors > 0 {
            info!(
              "Completed job '{}': {} published, {} data errors logged to DB, {} publish errors",
              job_name, job_published, job_data_errors, job_publish_errors
            );
          } else {
            info!(
              "Completed job '{}': {} published, {} publish errors",
              job_name, job_published, job_publish_errors
            );
          }

          if was_interrupted {
            // Shutdown signal received - mark as not running to retry on restart
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
  ) -> Result<(usize, usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_data_errors = 0;
    let mut total_publish_errors = 0;
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
        // Return was_interrupted=true so we can retry this batch on restart
        return Ok((total_published, total_data_errors, total_publish_errors, true));
      }

      if Self::should_log_progress(item_index, total_items) {
        info!(
          "Progress: {}/{} items ({:.1}%) - {} published, {} data errors, {} publish errors",
          item_index + 1,
          total_items,
          (item_index + 1) as f64 / total_items as f64 * 100.0,
          total_published,
          total_data_errors,
          total_publish_errors
        );
      }

      match self
        .process_single_item(record, shutdown_listener.clone())
        .await
      {
        Ok(ProcessResult::Published(published_change)) => {
          total_published += 1;
          published_batch.push(published_change);

          // Clear batch periodically to free memory (checkpoint only at end)
          if published_batch.len() >= crate::database::BATCH_SIZE {
            debug!("Clearing batch of {} items to free memory", published_batch.len());
            published_batch.clear();
            published_batch.shrink_to(crate::database::BATCH_SIZE);
          }
        }
        Ok(ProcessResult::DataError) => {
          total_data_errors += 1;
        }
        Ok(ProcessResult::PublishError) => {
          total_publish_errors += 1;
        }
        Err(e) => {
          error!("Unexpected error processing item {}: {}", item_index + 1, e);
          total_publish_errors += 1;
        }
      }
    }

    info!(
      "Completed processing all items: {} published, {} data errors (logged), {} publish errors",
      total_published, total_data_errors, total_publish_errors
    );

    // Only advance block if NO publish errors (transient failures should retry)
    // Data errors are logged and we can advance past them
    if total_publish_errors == 0 && (total_published > 0 || total_data_errors > 0) {
      self
        .database
        .mark_processed(&records[0..1], records[0].target_block)
        .await?;
      info!(
        "Marked block {} as processed ({} published, {} data errors logged)",
        records[0].target_block, total_published, total_data_errors
      );
    } else if total_publish_errors > 0 {
      warn!(
        "NOT advancing block due to {} publish errors - will retry on next cycle",
        total_publish_errors
      );
    }

    // Return was_interrupted=false since we completed normally
    // (publish errors are retried next cycle, not interruptions)
    Ok((total_published, total_data_errors, total_publish_errors, false))
  }

  async fn process_single_item(
    &self,
    record: &ChangeRecord,
    shutdown_listener: Listener,
  ) -> Result<ProcessResult, AtomicDataError> {
    if shutdown_listener.is_triggered() {
      return Ok(ProcessResult::PublishError);
    }

    let request = match self.publisher.prepare_change(record).await {
      Ok(req) => req,
      Err(e) => {
        let error_msg = format!("Failed to prepare change request for item: {}", e);
        error!("{}", error_msg);

        // Data error - log to DB and move on
        if let Err(db_err) = self.database.mark_record_failed(record, "protobuf_build_failure", &error_msg).await {
          warn!("Failed to log failed record to database: {}", db_err);
        }
        metrics::increment_protobuf_build_failures();

        return Ok(ProcessResult::DataError);
      }
    };

    let publish_start = Instant::now();
    let result = tokio::select! {
      result = self.publisher.publish_change_request(request) => result,
      _ = shutdown_listener.clone() => {
        warn!("Shutdown signal received during item publishing");
        return Ok(ProcessResult::PublishError);
      }
    };

    let publish_duration = publish_start.elapsed().as_secs_f64();

    match result {
      Ok(()) => {
        metrics::increment_published();
        metrics::observe_publish_duration(publish_duration);
        debug!("Successfully published change (duration: {:.2}s)", publish_duration);
        Ok(ProcessResult::Published(record.clone()))
      }
      Err(e) => {
        let error_msg = format!(
          "Failed to publish change for job '{}' (duration: {:.2}s): {}",
          record.job_name, publish_duration, e
        );
        error!("{}", error_msg);
        metrics::observe_publish_duration(publish_duration);

        // Publish failure - transient (network, ingestor issues)
        // Return PublishError to retry next cycle (don't mark as permanently failed)
        Ok(ProcessResult::PublishError)
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
