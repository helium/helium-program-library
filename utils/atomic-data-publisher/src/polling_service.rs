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
    let batch_size = self.config.service.batch_size as usize;
    let mut all_published_changes = Vec::new();

    for (batch_index, atomic_chunk) in job.atomic_data.chunks(batch_size).enumerate() {
      // Check for shutdown signal before processing each batch
      if shutdown_listener.is_triggered() {
        warn!(
          "Shutdown signal received during batch processing, stopping at batch {}",
          batch_index + 1
        );
        return Ok((total_published, total_failed, true)); // has_failures = true to prevent block advancement
      }

      info!(
        "Processing batch {}: {} atomic items",
        batch_index + 1,
        atomic_chunk.len()
      );

      let (chunk_published, chunk_failed, published_changes) =
        self.process_atomic_chunk(job, atomic_chunk, shutdown_listener.clone()).await?;

      total_published += chunk_published;
      total_failed += chunk_failed;
      all_published_changes.extend(published_changes);

      if chunk_failed > 0 {
        warn!(
          "Batch {} had {} failed changes, stopping processing",
          batch_index + 1,
          chunk_failed
        );
        return Ok((total_published, total_failed, true)); // has_failures = true
      }
    }

    // Only update the block counter after all batches succeed
    if !all_published_changes.is_empty() {
      self
        .database
        .mark_processed(&all_published_changes, job.target_block)
        .await?;
    }

    info!(
      "Completed processing all batches: {} published, {} failed",
      total_published, total_failed
    );
    Ok((total_published, total_failed, false)) // has_failures = false
  }

  async fn process_atomic_chunk(
    &self,
    job: &ChangeRecord,
    atomic_items: &[serde_json::Value],
    shutdown_listener: Listener,
  ) -> Result<(usize, usize, Vec<ChangeRecord>), AtomicDataError> {
    let batch_start = Instant::now();
    let chunk_record = ChangeRecord {
      job_name: job.job_name.clone(),
      query_name: job.query_name.clone(),
      target_block: job.target_block,
      atomic_data: atomic_items.to_vec(),
    };

    let change_requests = match self.publisher.prepare_changes_batch(&chunk_record).await {
      Ok(requests) => requests,
      Err(e) => {
        error!("Failed to prepare changes batch for chunk: {}", e);
        return Ok((0, atomic_items.len(), Vec::new()));
      }
    };

    if change_requests.len() != atomic_items.len() {
      error!(
        "Mismatch between change requests ({}) and atomic items ({}) for job '{}'",
        change_requests.len(),
        atomic_items.len(),
        job.job_name
      );
      return Ok((0, atomic_items.len(), Vec::new()));
    }

    debug!(
      "Prepared {} change requests for {} atomic items",
      change_requests.len(),
      atomic_items.len()
    );

    let mut published_changes = Vec::new();
    let mut failed_count = 0;

    // Publish changes sequentially, checking for shutdown before each item
    for (index, (request, atomic_item)) in change_requests.into_iter().zip(atomic_items.iter()).enumerate() {
      // Use tokio::select to race publish against shutdown signal
      tokio::select! {
        result = Self::publish_single_change(
          request,
          atomic_item.clone(),
          job.job_name.clone(),
          job.query_name.clone(),
          job.target_block,
          &self.publisher,
        ) => {
          match result {
            Ok(change) => published_changes.push(change),
            Err(_) => failed_count += 1,
          }
        }
        _ = shutdown_listener.clone() => {
          warn!(
            "Shutdown signal received during item publishing, stopping at item {}/{}",
            index + 1, atomic_items.len()
          );
          // Return what we've published so far, mark rest as failed
          let remaining = atomic_items.len() - index;
          return Ok((published_changes.len(), failed_count + remaining, published_changes));
        }
      }
    }

    let chunk_published = published_changes.len();

    let batch_time = batch_start.elapsed();
    info!(
      "Batch completed in {:?}: {} changes published, {} failed",
      batch_time, chunk_published, failed_count
    );

    Ok((chunk_published, failed_count, published_changes))
  }

  async fn publish_single_change(
    request: crate::protobuf::EntityChangeRequest,
    atomic_item: serde_json::Value,
    job_name: String,
    query_name: String,
    target_block: u64,
    publisher: &Publisher,
  ) -> Result<ChangeRecord, ChangeRecord> {
    let publish_start = Instant::now();
    let result = publisher.publish_change_request(request).await;
    let publish_duration = publish_start.elapsed().as_secs_f64();

    match result {
      Ok(()) => {
        metrics::increment_published();
        metrics::observe_publish_duration(publish_duration);
        Ok(ChangeRecord {
          job_name,
          query_name,
          target_block,
          atomic_data: vec![atomic_item],
        })
      }
      Err(e) => {
        error!(
          "Failed to publish change for job '{}' (duration: {:.2}s): {}",
          job_name, publish_duration, e
        );
        metrics::increment_errors();
        metrics::observe_publish_duration(publish_duration);
        Err(ChangeRecord {
          job_name,
          query_name,
          target_block,
          atomic_data: vec![atomic_item],
        })
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
