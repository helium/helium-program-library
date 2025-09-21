use anyhow::Result;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};

use tracing::{debug, info, warn};

use crate::config::{DatabaseConfig, PollingJob};
use crate::errors::AtomicDataError;
use crate::metrics::MetricsCollector;
use std::sync::Arc;

const MIN_CHUNK_SIZE: u64 = 1000;
const MAX_CHUNK_SIZE: u64 = 100_000_000;
const DEFAULT_CHUNK_PERCENTAGE: f64 = 0.10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
  pub job_name: String,
  pub atomic_data: serde_json::Value,
}

#[derive(Debug)]
pub struct DatabaseClient {
  pool: PgPool,
  polling_jobs: Vec<PollingJob>,
  metrics: Option<Arc<MetricsCollector>>,
}

impl DatabaseClient {
  pub async fn new_with_metrics(
    config: &DatabaseConfig,
    polling_jobs: Vec<PollingJob>,
    metrics: Option<Arc<MetricsCollector>>
  ) -> Result<Self> {
    Self::validate_database_config(config)?;
    Self::validate_polling_jobs(&polling_jobs)?;
    let database_url = format!(
      "postgres://{}:{}@{}:{}/{}",
      config.username, config.password, config.host, config.port, config.database_name
    );

    let pool = PgPoolOptions::new()
      .max_connections(config.max_connections)
      .min_connections(config.min_connections)
      .acquire_timeout(std::time::Duration::from_secs(
        config.acquire_timeout_seconds,
      ))
      .idle_timeout(std::time::Duration::from_secs(config.idle_timeout_seconds))
      .max_lifetime(std::time::Duration::from_secs(config.max_lifetime_seconds))
      .connect(&database_url)
      .await?;

    sqlx::query("SELECT 1").execute(&pool).await?;

    info!(
      "Connected to database at {}:{}/{}",
      config.host, config.port, config.database_name
    );

    Ok(Self { pool, polling_jobs, metrics })
  }

  fn validate_database_config(config: &DatabaseConfig) -> Result<()> {
    if config.host.is_empty() {
      anyhow::bail!("Database host cannot be empty");
    }
    if config.username.is_empty() {
      anyhow::bail!("Database username cannot be empty");
    }
    if config.database_name.is_empty() {
      anyhow::bail!("Database name cannot be empty");
    }
    if config.port == 0 {
      anyhow::bail!("Database port cannot be zero");
    }
    if config.max_connections == 0 {
      anyhow::bail!("Database max_connections must be greater than 0");
    }
    if config.max_connections < config.min_connections {
      anyhow::bail!("Database max_connections ({}) must be >= min_connections ({})",
                   config.max_connections, config.min_connections);
    }
    Ok(())
  }

  fn validate_polling_jobs(jobs: &[PollingJob]) -> Result<()> {
    if jobs.is_empty() {
      warn!("No polling jobs configured - service will not process any changes");
      return Ok(());
    }

    for (index, job) in jobs.iter().enumerate() {
      if job.name.is_empty() {
        anyhow::bail!("Job {}: name cannot be empty", index);
      }
      if job.query_name.is_empty() {
        anyhow::bail!("Job '{}' (index {}): query_name cannot be empty", job.name, index);
      }
      if !job.parameters.is_object() {
        anyhow::bail!("Job '{}' (index {}): parameters must be a valid JSON object", job.name, index);
      }

      if job.query_name == "construct_atomic_hotspots" {
        if !job.parameters.get("hotspot_type").is_some() {
          anyhow::bail!("Job '{}' (index {}): hotspot_type parameter is required for construct_atomic_hotspots queries",
                       job.name, index);
        }
      }
    }

    Ok(())
  }

  pub async fn init_polling_state(&self) -> Result<()> {
    self.create_state_table().await?;
    for (index, job) in self.polling_jobs.iter().enumerate() {
      self
        .init_job_state(&job.name, &job.query_name, index as i32)
        .await?;
    }

    info!(
      "Initialized polling state for {} jobs",
      self.polling_jobs.len()
    );
    Ok(())
  }

  pub async fn create_state_table(&self) -> Result<()> {
    let create_table_query = r#"
      CREATE TABLE IF NOT EXISTS atomic_data_polling_state (
        job_name VARCHAR(255) NOT NULL UNIQUE,
        query_name VARCHAR(255) NOT NULL DEFAULT 'default',
        queue_position INTEGER NOT NULL DEFAULT 0,
        last_processed_block BIGINT NOT NULL DEFAULT 0,
        is_running BOOLEAN NOT NULL DEFAULT FALSE,
        running_since TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        queue_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (job_name, query_name)
      )
    "#;

    sqlx::query(create_table_query).execute(&self.pool).await?;
    info!("Created or verified atomic_data_polling_state table with job_name structure");

    let create_index_query = r#"
      CREATE INDEX IF NOT EXISTS idx_polling_state_updated_at
      ON atomic_data_polling_state (updated_at)
    "#;
    sqlx::query(create_index_query).execute(&self.pool).await?;

    let create_queue_index_query = r#"
      CREATE INDEX IF NOT EXISTS idx_polling_state_queue_position
      ON atomic_data_polling_state (queue_position, queue_completed_at)
    "#;
    sqlx::query(create_queue_index_query)
      .execute(&self.pool)
      .await?;

    info!("Created or verified atomic_data_polling_state table with query-level tracking support");
    Ok(())
  }

  pub async fn table_exists(&self, table_name: &str) -> Result<bool> {
    let query = r#"
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      );
    "#;

    let row = sqlx::query(query)
      .bind(table_name)
      .fetch_one(&self.pool)
      .await?;

    let exists: bool = row.get(0);
    Ok(exists)
  }

  pub async fn init_job_state(
    &self,
    job_name: &str,
    query_name: &str,
    queue_position: i32,
  ) -> Result<()> {
    let existing_state = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .fetch_optional(&self.pool)
    .await?;

    if let Some(row) = existing_state {
      let block: i64 = row.get("last_processed_block");
      sqlx::query(
        r#"
        UPDATE atomic_data_polling_state
        SET queue_position = $1, updated_at = NOW()
        WHERE job_name = $2 AND query_name = $3
        "#,
      )
      .bind(queue_position)
      .bind(job_name)
      .bind(query_name)
      .execute(&self.pool)
      .await?;

      info!(
        "Resuming polling for job '{}' query '{}' from block {} with queue position {}",
        job_name, query_name, block, queue_position
      );
    } else {
      sqlx::query(
        r#"
        INSERT INTO atomic_data_polling_state (job_name, query_name, last_processed_block, queue_position)
        VALUES ($1, $2, $3, $4)
        "#
      )
      .bind(job_name)
      .bind(query_name)
      .bind(0i64)
      .bind(queue_position)
      .execute(&self.pool)
      .await?;

      info!(
        "Initialized new polling state for job '{}' query '{}' starting from block 0 with queue position {}",
        job_name, query_name, queue_position
      );
    }

    Ok(())
  }

  pub async fn get_pending_changes(
    &self,
  ) -> Result<Option<(Vec<ChangeRecord>, (String, String), u64)>> {
    if self.any_job_running().await? {
      return Ok(None);
    }

    if let Some(job) = self.get_next_queue_job().await? {
      if !self.mark_job_running(&job.name, &job.query_name).await? {
        return Ok(None);
      }

      let (changes, target_block) =
        match self.execute_job_polling(&job).await {
          Ok(result) => result,
          Err(e) => {
            let _ = self.mark_job_not_running(&job.name, &job.query_name).await;
            return Err(e.into());
          }
        };

      Ok(Some((changes, (job.name, job.query_name), target_block)))
    } else {
      self.reset_job_queue().await?;
      Ok(None)
    }
  }

  async fn execute_job_polling(
    &self,
    job: &PollingJob,
  ) -> Result<(Vec<ChangeRecord>, u64), AtomicDataError> {
    let (last_processed_block, max_available_block) = self.get_polling_bounds(job).await?;
    if max_available_block <= last_processed_block {
      return Ok((Vec::new(), last_processed_block));
    }

    let target_block = self.calculate_target_block(last_processed_block, max_available_block);
    let rows = self.execute_query(job, last_processed_block, target_block).await?;
    let changes = self.process_query_results(&rows, &job.name);

    info!(
      "Found {} changes for job '{}' (processed up to block {})",
      changes.len(),
      job.name,
      target_block
    );
    Ok((changes, target_block))
  }

  /// Get the polling bounds (last processed block and max available block) for a job
  async fn get_polling_bounds(&self, job: &PollingJob) -> Result<(u64, u64), AtomicDataError> {
    let current_state_row = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(&job.name)
    .bind(&job.query_name)
    .fetch_one(&self.pool)
    .await?;

    let last_processed_block: i64 = current_state_row.get("last_processed_block");

    let max_available_block = self.get_max_last_block_for_query(&job.query_name).await?
      .ok_or_else(|| AtomicDataError::PollingBoundsError(format!("No data available for query '{}'", job.query_name)))?;

    Ok((last_processed_block as u64, max_available_block))
  }

  fn calculate_target_block(&self, last_processed_block: u64, max_available_block: u64) -> u64 {
    let block_diff = max_available_block.saturating_sub(last_processed_block);

    let chunk_size = if block_diff <= MIN_CHUNK_SIZE {
      block_diff
    } else {
      // Scale chunk size logarithmically: roughly 10% of remaining blocks, with bounds
      let scaled_chunk = (block_diff as f64 * DEFAULT_CHUNK_PERCENTAGE) as u64;
      scaled_chunk.clamp(MIN_CHUNK_SIZE, MAX_CHUNK_SIZE)
    };

    std::cmp::min(last_processed_block + chunk_size, max_available_block)
  }

  async fn execute_query(
    &self,
    job: &PollingJob,
    last_processed_block: u64,
    target_block: u64,
  ) -> Result<Vec<sqlx::postgres::PgRow>, AtomicDataError> {
    crate::queries::AtomicHotspotQueries::validate_query_name(&job.query_name)
      .map_err(|e| AtomicDataError::QueryValidationError(format!("Query validation failed for '{}': {}", job.query_name, e)))?;

    let query = crate::queries::AtomicHotspotQueries::get_query(&job.query_name)
      .ok_or_else(|| AtomicDataError::QueryValidationError(format!("Query not found for '{}'", job.query_name)))?;

    let query_start = std::time::Instant::now();

    let rows = if job.query_name == "construct_atomic_hotspots" {
      let hotspot_type = job
        .parameters
        .get("hotspot_type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AtomicDataError::InvalidData("hotspot_type parameter required for hotspot queries".to_string()))?;

      match hotspot_type {
        "iot" | "mobile" => {},
        _ => return Err(AtomicDataError::InvalidData(format!("Invalid hotspot_type: '{}'. Must be 'iot' or 'mobile'", hotspot_type))),
      }

      info!(
        "Querying job '{}' with query '{}' for hotspot_type '{}', processing blocks {} to {} ({} blocks)",
        job.name, job.query_name, hotspot_type, last_processed_block, target_block, target_block - last_processed_block
      );

      sqlx::query(query)
        .bind(hotspot_type)
        .bind(last_processed_block as i64)
        .bind(target_block as i64)
        .fetch_all(&self.pool)
        .await?
    } else {
      info!(
        "Querying job '{}' with query '{}', processing blocks {} to {} ({} blocks)",
        job.name, job.query_name, last_processed_block, target_block, target_block - last_processed_block
      );

      sqlx::query(query)
        .bind(last_processed_block as i64)
        .bind(target_block as i64)
        .fetch_all(&self.pool)
        .await?
    };

    let query_duration = query_start.elapsed().as_secs_f64();
    if let Some(ref metrics) = self.metrics {
      metrics.observe_database_query_duration(query_duration);
    }

    Ok(rows)
  }

  fn process_query_results(&self, rows: &[sqlx::postgres::PgRow], job_name: &str) -> Vec<ChangeRecord> {
    let mut changes = Vec::with_capacity(rows.len());

    for row in rows {
      let mut atomic_data_array = Vec::with_capacity(1);
      atomic_data_array.push(row.get::<serde_json::Value, _>("atomic_data"));

      changes.push(ChangeRecord {
        job_name: job_name.to_string(),
        atomic_data: serde_json::Value::Array(atomic_data_array),
      });
    }

    changes
  }

  pub async fn mark_processed(&self, changes: &[ChangeRecord], target_block: u64) -> Result<()> {
    if changes.is_empty() {
      return self
        .advance_block_for_active_job(target_block)
        .await;
    }

    let mut processed_tables = std::collections::HashSet::new();

    debug!(
      "Marking {} changes as processed with Solana height {}",
      changes.len(),
      target_block
    );
    for change in changes {
      processed_tables.insert(change.job_name.clone());
    }

    for job_name in processed_tables {
      if let Some(job) = self.polling_jobs.iter().find(|j| j.name == job_name) {
        sqlx::query(
          r#"
          UPDATE atomic_data_polling_state
          SET
            last_processed_block = $1,
            updated_at = NOW()
          WHERE job_name = $2 AND query_name = $3
          "#,
        )
        .bind(target_block as i64)
        .bind(&job.name)
        .bind(&job.query_name)
        .execute(&self.pool)
        .await?;

        info!(
          "Updated polling state for job '{}' query '{}': last_processed_block -> {} (target height)",
          job.name, job.query_name, target_block
        );
      } else {
        warn!(
          "No polling job configuration found for job name: {}",
          job_name
        );
      }
    }

    debug!(
      "Marked {} changes as processed with Solana height {}",
      changes.len(),
      target_block
    );
    Ok(())
  }

  async fn advance_block_for_active_job(&self, target_block: u64) -> Result<()> {
    let active_job = sqlx::query(
      r#"
      SELECT job_name, query_name
      FROM atomic_data_polling_state
      WHERE is_running = TRUE
      LIMIT 1
      "#,
    )
    .fetch_optional(&self.pool)
    .await?;

    if let Some(row) = active_job {
      let job_name: String = row.get("job_name");
      let query_name: String = row.get("query_name");

      sqlx::query(
        r#"
        UPDATE atomic_data_polling_state
        SET
          last_processed_block = $1,
          updated_at = NOW()
        WHERE job_name = $2 AND query_name = $3
        "#,
      )
      .bind(target_block as i64)
      .bind(&job_name)
      .bind(&query_name)
      .execute(&self.pool)
      .await?;

      debug!(
        "Advanced block to {} for job '{}' query '{}' (no changes)",
        target_block, job_name, query_name
      );
    }

    Ok(())
  }

  pub async fn health_check(&self) -> Result<()> {
    sqlx::query("SELECT 1").execute(&self.pool).await?;
    Ok(())
  }

  pub async fn get_max_last_block_for_query(&self, query_name: &str) -> Result<Option<u64>> {
    let max_block = match query_name {
      "construct_atomic_hotspots" => {
        let row = sqlx::query(
          r#"
          SELECT GREATEST(
            COALESCE((SELECT MAX(last_block) FROM mobile_hotspot_infos), 0),
            COALESCE((SELECT MAX(last_block) FROM iot_hotspot_infos), 0)
          )::bigint as max_block
          "#
        )
        .fetch_one(&self.pool)
        .await?;

        let max_block: i64 = row.get("max_block");
        if max_block > 1 { Some((max_block - 1) as u64) } else { None }
      }
      "construct_entity_ownership_changes" => {
        let row = sqlx::query(
          r#"
          SELECT GREATEST(
            COALESCE((SELECT MAX(last_block) FROM asset_owners), 0),
            COALESCE((SELECT MAX(last_block) FROM welcome_packs), 0)
          )::bigint as max_block
          "#
        )
        .fetch_one(&self.pool)
        .await?;

        let max_block: i64 = row.get("max_block");
        if max_block > 1 { Some((max_block - 1) as u64) } else { None }
      }
      "construct_entity_reward_destination_changes" => {
        let row = sqlx::query(
          r#"
          SELECT GREATEST(
            COALESCE((SELECT MAX(last_block) FROM recipients), 0),
            COALESCE((SELECT MAX(last_block) FROM rewards_recipients), 0)
          )::bigint as max_block
          "#
        )
        .fetch_one(&self.pool)
        .await?;

        let max_block: i64 = row.get("max_block");
        if max_block > 1 { Some((max_block - 1) as u64) } else { None }
      }
      _ => {
        warn!("Unknown query name: {}", query_name);
        None
      }
    };

    debug!(
      "Max last_block for query '{}': {:?} (using MAX(last_block) - 1 for safety)",
      query_name, max_block
    );

    Ok(max_block)
  }


  pub async fn any_job_running(&self) -> Result<bool> {
    let row = sqlx::query(
      r#"
      SELECT COUNT(*) as running_count
      FROM atomic_data_polling_state
      WHERE is_running = TRUE
      "#,
    )
    .fetch_one(&self.pool)
    .await?;

    let running_count: i64 = row.get("running_count");
    let is_any_running = running_count > 0;

    if is_any_running {
      debug!("Found {} job(s) currently running", running_count);
    }

    Ok(is_any_running)
  }

  pub async fn mark_job_running(&self, job_name: &str, query_name: &str) -> Result<bool> {
    let mut tx = self.pool.begin().await?;
    let existing = sqlx::query(
      r#"
      SELECT is_running
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      FOR UPDATE
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(row) = existing {
      let is_running: bool = row.get("is_running");
      if is_running {
        tx.rollback().await?;
        debug!(
          "Job '{}' query '{}' is already running",
          job_name, query_name
        );
        return Ok(false);
      }
    }

    let result = sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = TRUE,
        running_since = NOW(),
        updated_at = NOW()
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() > 0 {
      tx.commit().await?;
      info!(
        "Marked job '{}' query '{}' as running",
        job_name, query_name
      );
      Ok(true)
    } else {
      tx.rollback().await?;
      warn!(
        "Failed to mark job '{}' query '{}' as running - job not found",
        job_name, query_name
      );
      Ok(false)
    }
  }

  pub async fn mark_job_not_running(&self, job_name: &str, query_name: &str) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = FALSE,
        running_since = NULL,
        updated_at = NOW()
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .execute(&self.pool)
    .await?;

    debug!(
      "Marked job '{}' query '{}' as not running",
      job_name, query_name
    );
    Ok(())
  }

  async fn get_next_queue_job(&self) -> Result<Option<PollingJob>> {
    let row = sqlx::query(
      r#"
      SELECT job_name, query_name
      FROM atomic_data_polling_state
      WHERE queue_completed_at IS NULL
      ORDER BY queue_position ASC
      LIMIT 1
      "#,
    )
    .fetch_optional(&self.pool)
    .await?;

    if let Some(row) = row {
      let job_name: String = row.get("job_name");
      let query_name: String = row.get("query_name");
      for job in &self.polling_jobs {
        if job.name == job_name && job.query_name == query_name {
          return Ok(Some(job.clone()));
        }
      }

      warn!(
        "Job '{}' query '{}' found in queue but not in configuration",
        job_name, query_name
      );
    }

    Ok(None)
  }

  pub async fn mark_completed(&self, job_name: &str, query_name: &str) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        queue_completed_at = NOW(),
        updated_at = NOW()
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .execute(&self.pool)
    .await?;

    debug!(
      "Marked job '{}' query '{}' as completed in queue",
      job_name, query_name
    );
    Ok(())
  }

  async fn reset_job_queue(&self) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        queue_completed_at = NULL,
        updated_at = NOW()
      "#,
    )
    .execute(&self.pool)
    .await?;

    info!("Reset job queue - all jobs marked as not completed for new cycle");
    Ok(())
  }

  pub async fn cleanup_stale_jobs(&self) -> Result<()> {
    let stale_threshold = Utc::now() - Duration::minutes(30);

    let result = sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = FALSE,
        running_since = NULL,
        updated_at = NOW()
      WHERE is_running = TRUE
        AND (running_since IS NULL OR running_since < $1)
      "#,
    )
    .bind(stale_threshold)
    .execute(&self.pool)
    .await?;

    if result.rows_affected() > 0 {
      info!(
        "Cleaned up {} stale running job states",
        result.rows_affected()
      );
    }

    Ok(())
  }

  pub async fn cleanup_all_jobs(&self) -> Result<()> {
    let result = sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = FALSE,
        running_since = NULL,
        updated_at = NOW()
      WHERE is_running = TRUE
      "#,
    )
    .execute(&self.pool)
    .await?;

    if result.rows_affected() > 0 {
      info!(
        "Cleaned up {} running job states during shutdown",
        result.rows_affected()
      );
    } else {
      info!("No running job states to clean up");
    }

    Ok(())
  }
}
