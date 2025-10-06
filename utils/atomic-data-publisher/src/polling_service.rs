use std::{
  sync::Arc,
  time::{Duration, Instant},
};

use tokio::time::{interval, sleep};
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

#[derive(Debug)]
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
                  metrics::increment_errors();
                  sleep(Duration::from_secs(POLLING_ERROR_RETRY_SECONDS)).await;
              }

              let cycle_time = cycle_start.elapsed();
              debug!("Polling cycle completed in {:?}", cycle_time);
          }
          _ = shutdown_listener.clone() => {
              info!("Shutting down polling service");
              break;
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
        let row_count = record.atomic_data.len();
        let job_name = record.job_name.clone();
        let query_name = record.query_name.clone();
        let target_block = record.target_block;

        info!(
          "Processing job '{}' with {} rows (target block: {})",
          job_name, row_count, target_block
        );

        match self.process_job(&record).await {
          Ok((job_published, job_failed, should_break)) => {
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

            if should_break {
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
  ) -> Result<(usize, usize, bool), AtomicDataError> {
    let mut total_published = 0;
    let mut total_failed = 0;
    let batch_size = self.config.service.batch_size as usize;

    for (batch_index, atomic_chunk) in job.atomic_data.chunks(batch_size).enumerate() {
      info!(
        "Processing batch {}: {} atomic items",
        batch_index + 1,
        atomic_chunk.len()
      );

      let (chunk_published, chunk_failed) =
        self.process_atomic_chunk(job, atomic_chunk).await?;

      total_published += chunk_published;
      total_failed += chunk_failed;

      if chunk_failed > 0 {
        warn!(
          "Batch {} had {} failed changes, stopping processing",
          batch_index + 1,
          chunk_failed
        );
        return Ok((total_published, total_failed, true));
      }
    }

    info!(
      "Completed processing all batches: {} published, {} failed",
      total_published, total_failed
    );
    Ok((total_published, total_failed, false))
  }

  async fn process_atomic_chunk(
    &self,
    job: &ChangeRecord,
    atomic_items: &[serde_json::Value],
  ) -> Result<(usize, usize), AtomicDataError> {
    let batch_start = Instant::now();
    let semaphore = Arc::new(tokio::sync::Semaphore::new(
      self.config.service.max_concurrent_publishes as usize,
    ));

    let tasks: Vec<_> = atomic_items
      .iter()
      .map(|item| {
        let change_record = ChangeRecord {
          job_name: job.job_name.clone(),
          query_name: job.query_name.clone(),
          target_block: job.target_block,
          atomic_data: vec![item.clone()],
        };
        let publisher = self.publisher.clone();
        let semaphore = semaphore.clone();

        tokio::spawn(async move {
          Self::publish_single_change(change_record, publisher, semaphore).await
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
          metrics::increment_errors();
        }
      }
    }

    let chunk_published = published_changes.len();
    let chunk_failed = failed_changes.len();

    if !published_changes.is_empty() {
      self
        .database
        .mark_processed(&published_changes, job.target_block)
        .await?;
    }

    let batch_time = batch_start.elapsed();
    info!(
      "Batch completed in {:?}: {} changes published, {} failed",
      batch_time, chunk_published, chunk_failed
    );

    Ok((chunk_published, chunk_failed))
  }

  async fn publish_single_change(
    change: ChangeRecord,
    publisher: Arc<Publisher>,
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
          metrics::increment_published();
        }
        metrics::observe_publish_duration(publish_duration);
        info!(
          "Published {} individual changes for job '{}'",
          published_ids.len(),
          change.job_name
        );
        Ok(change)
      }
      Ok(_) => {
        metrics::increment_errors();
        metrics::observe_publish_duration(publish_duration);
        Err(change)
      }
      Err(e) => {
        error!(
          "Failed to publish change for job '{}' (duration: {:.2}s): {}",
          change.job_name, publish_duration, e
        );
        metrics::increment_errors();
        metrics::observe_publish_duration(publish_duration);
        Err(change)
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
