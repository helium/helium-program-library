use anyhow::Result;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};

use tracing::{debug, info, warn};

use crate::config::{DatabaseConfig, PollingJob};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
  pub job_name: String,
  pub atomic_data: serde_json::Value,
}

#[derive(Debug)]
pub struct DatabaseClient {
  pool: PgPool,
  polling_jobs: Vec<PollingJob>,
}

impl DatabaseClient {
  pub async fn new(config: &DatabaseConfig, polling_jobs: Vec<PollingJob>) -> Result<Self> {
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

    Ok(Self { pool, polling_jobs })
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
        last_processed_block_height BIGINT NOT NULL DEFAULT 0,
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

    // Create index for queue processing
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
    // Check if state already exists for this job
    let existing_state = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block_height
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .fetch_optional(&self.pool)
    .await?;

    if let Some(row) = existing_state {
      let block_height: i64 = row.get("last_processed_block_height");

      // Update queue position for existing job
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
        "Resuming polling for job '{}' query '{}' from block height {} with queue position {}",
        job_name, query_name, block_height, queue_position
      );
    } else {
      // Insert new state with block height 0 and queue position
      sqlx::query(
        r#"
        INSERT INTO atomic_data_polling_state (job_name, query_name, last_processed_block_height, queue_position)
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
        "Initialized new polling state for job '{}' query '{}' starting from block height 0 with queue position {}",
        job_name, query_name, queue_position
      );
    }

    Ok(())
  }

  pub async fn get_pending_changes(
    &self,
    current_solana_height: u64,
  ) -> Result<Option<(Vec<ChangeRecord>, (String, String), u64)>> {
    if self.any_job_running().await? {
      return Ok(None);
    }

    if let Some(job) = self.get_next_queue_job().await? {
      if !self.mark_job_running(&job.name, &job.query_name).await? {
        return Ok(None);
      }

      let (changes, target_height) =
        match self.execute_job_polling(&job, current_solana_height).await {
          Ok(result) => result,
          Err(e) => {
            let _ = self.mark_job_not_running(&job.name, &job.query_name).await;
            return Err(e);
          }
        };

      Ok(Some((changes, (job.name, job.query_name), target_height)))
    } else {
      self.reset_job_queue().await?;
      Ok(None)
    }
  }

  async fn execute_job_polling(
    &self,
    job: &PollingJob,
    current_solana_height: u64,
  ) -> Result<(Vec<ChangeRecord>, u64)> {
    // Get current polling state from database
    let current_state_row = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block_height
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(&job.name)
    .bind(&job.query_name)
    .fetch_one(&self.pool)
    .await?;

    let last_processed_height: i64 = current_state_row.get("last_processed_block_height");

    // Get the query from the queries module
    let query = crate::queries::AtomicHotspotQueries::get_query(&job.query_name)
      .ok_or_else(|| anyhow::anyhow!("{} query not found", job.query_name))?;

    let height_diff = current_solana_height.saturating_sub(last_processed_height as u64);
    let chunk_size = if height_diff <= 1000 {
      height_diff
    } else {
      // Scale chunk size logarithmically: roughly 10% of remaining blocks, with bounds
      let scaled_chunk = (height_diff as f64 * 0.10) as u64;
      scaled_chunk.clamp(1000, 100_000_000) // Min 1k blocks, max 100M blocks
    };

    // Calculate target height but ensure we don't skip blocks between cycles
    // The key insight: we need to process ALL blocks up to current_solana_height eventually
    let target_height = std::cmp::min(
      last_processed_height as u64 + chunk_size,
      current_solana_height,
    );

    // Different queries have different parameter patterns
    let rows = if job.query_name == "construct_atomic_hotspots" {
      // Extract hotspot_type from parameters for hotspot queries
      let hotspot_type = job
        .parameters
        .get("hotspot_type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("hotspot_type parameter required for hotspot queries"))?;

      info!(
        "Querying job '{}' with query '{}' for hotspot_type '{}', processing blocks {} to {} ({} blocks)",
        job.name, job.query_name, hotspot_type, last_processed_height, target_height, target_height - last_processed_height as u64
      );

      sqlx::query(query)
        .bind(hotspot_type)
        .bind(last_processed_height)
        .bind(target_height as i64)
        .fetch_all(&self.pool)
        .await?
    } else {
      // Entity ownership and reward destination queries don't need hotspot_type
      info!(
        "Querying job '{}' with query '{}', processing blocks {} to {} ({} blocks)",
        job.name, job.query_name, last_processed_height, target_height, target_height - last_processed_height as u64
      );

      sqlx::query(query)
        .bind(last_processed_height)
        .bind(target_height as i64)
        .fetch_all(&self.pool)
        .await?
    };

    let mut changes = Vec::new();
    for row in rows {
      let solana_address: Option<String> = row.try_get("solana_address").ok();
      let asset: Option<String> = row.try_get("asset").ok();
      let atomic_data: serde_json::Value = row.get("atomic_data");

      if let (Some(_address), Some(_asset_key)) = (solana_address, asset) {
        let change_record = ChangeRecord {
          job_name: job.name.clone(),
          atomic_data: serde_json::Value::Array(vec![atomic_data]),
        };
        changes.push(change_record);
      }
    }

    info!(
      "Found {} changes for job '{}' (processed up to block {})",
      changes.len(),
      job.name,
      target_height
    );
    Ok((changes, target_height))
  }

  pub async fn mark_processed(&self, changes: &[ChangeRecord], target_height: u64) -> Result<()> {
    if changes.is_empty() {
      return self
        .advance_block_height_for_active_job(target_height)
        .await;
    }

    // Group changes by table to update polling state for each
    let mut processed_tables = std::collections::HashSet::new();

    debug!(
      "Marking {} changes as processed with Solana height {}",
      changes.len(),
      target_height
    );
    for change in changes {
      processed_tables.insert(change.job_name.clone());
    }

    // Update polling state for each job with the current Solana block height
    for job_name in processed_tables {
      if let Some(job) = self.polling_jobs.iter().find(|j| j.name == job_name) {
        sqlx::query(
          r#"
          UPDATE atomic_data_polling_state
          SET
            last_processed_block_height = $1,
            updated_at = NOW()
          WHERE job_name = $2 AND query_name = $3
          "#,
        )
        .bind(target_height as i64)
        .bind(&job.name)
        .bind(&job.query_name)
        .execute(&self.pool)
        .await?;

        info!(
          "Updated polling state for job '{}' query '{}': last_processed_block_height -> {} (target height)",
          job.name, job.query_name, target_height
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
      target_height
    );
    Ok(())
  }

  async fn advance_block_height_for_active_job(&self, target_height: u64) -> Result<()> {
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
          last_processed_block_height = $1,
          updated_at = NOW()
        WHERE job_name = $2 AND query_name = $3
        "#,
      )
      .bind(target_height as i64)
      .bind(&job_name)
      .bind(&query_name)
      .execute(&self.pool)
      .await?;

      debug!(
        "Advanced block height to {} for job '{}' query '{}' (no changes)",
        target_height, job_name, query_name
      );
    }

    Ok(())
  }

  pub async fn health_check(&self) -> Result<()> {
    sqlx::query("SELECT 1").execute(&self.pool).await?;
    Ok(())
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
        // Job is already running, rollback and return false
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

      // Find the corresponding job in our configuration
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
