use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};

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

    // Test the connection
    sqlx::query("SELECT 1").execute(&pool).await?;

    info!(
      "Connected to database at {}:{}/{}",
      config.host, config.port, config.database_name
    );

    Ok(Self {
      pool,
      polling_jobs,
    })
  }

    /// Initialize persistent polling state table and load/create state for each polling job
  pub async fn initialize_polling_state(&self) -> Result<()> {
    // Create the polling state table if it doesn't exist
    self.create_polling_state_table().await?;

    // Initialize state for each polling job with queue positions
    for (index, job) in self.polling_jobs.iter().enumerate() {
      self.initialize_job_polling_state(&job.name, &job.query_name, index as i32).await?;
    }

    info!("Initialized polling state for {} jobs", self.polling_jobs.len());
    Ok(())
  }

  /// Create the polling state table
  pub async fn create_polling_state_table(&self) -> Result<()> {
    let create_table_query = r#"
      CREATE TABLE IF NOT EXISTS atomic_data_polling_state (
        job_name VARCHAR(255) NOT NULL UNIQUE,
        query_name VARCHAR(255) NOT NULL DEFAULT 'default',
        last_processed_block_height BIGINT NOT NULL DEFAULT 0,
        last_poll_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        is_running BOOLEAN NOT NULL DEFAULT FALSE,
        running_since TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        queue_position INTEGER NOT NULL DEFAULT 0,
        queue_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
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
    sqlx::query(create_queue_index_query).execute(&self.pool).await?;

    info!("Created or verified atomic_data_polling_state table with query-level tracking support");
    Ok(())
  }

  /// Create performance indexes for the atomic data publisher
  /// These indexes optimize the batch query joins and lookups
  pub async fn create_performance_indexes(&self) -> Result<()> {
    info!("Creating performance indexes for atomic data publisher...");

    let indexes = vec![
      // ESSENTIAL: Address lookups for hotspot data retrieval
      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mobile_hotspot_infos_address
      ON mobile_hotspot_infos (address);
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_iot_hotspot_infos_address
      ON iot_hotspot_infos (address);
      "#,

      // ESSENTIAL: Owner lookups for asset ownership resolution
      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_owners_owner
      ON asset_owners (owner);
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_welcome_packs_owner
      ON welcome_packs (owner);
      "#,

      // ESSENTIAL: Mini fanout lookups for ownership resolution
      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mini_fanouts_owner
      ON mini_fanouts (owner);
      "#,

      // CRITICAL: Composite indexes for optimized UNION ALL queries (primary indexes for our optimized query)
      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_owners_asset_block_height
      ON asset_owners (asset, last_block_height) WHERE asset IS NOT NULL;
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_key_to_assets_asset_block_height
      ON key_to_assets (asset, last_block_height) WHERE asset IS NOT NULL;
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipients_asset_block_height
      ON recipients (asset, last_block_height) WHERE asset IS NOT NULL;
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mobile_hotspot_infos_asset_block_height
      ON mobile_hotspot_infos (asset, last_block_height) WHERE asset IS NOT NULL;
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_iot_hotspot_infos_asset_block_height
      ON iot_hotspot_infos (asset, last_block_height) WHERE asset IS NOT NULL;
      "#,

      r#"
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_welcome_packs_asset_block_height
      ON welcome_packs (asset, last_block_height) WHERE asset IS NOT NULL;
      "#,
    ];

    for (i, index_sql) in indexes.iter().enumerate() {
      info!("Creating index {}/{}...", i + 1, indexes.len());
      match sqlx::query(index_sql).execute(&self.pool).await {
        Ok(_) => debug!("Successfully created index {}/{}", i + 1, indexes.len()),
        Err(e) => {
          // Log warning but don't fail - index might already exist or be in progress
          warn!("Failed to create index {}/{}: {}", i + 1, indexes.len(), e);
        }
      }
    }

    info!("✅ Performance indexes creation completed");
    Ok(())
  }

  /// Check if a table exists in the database (public interface)
  pub async fn table_exists(&self, table_name: &str) -> Result<bool> {
    self.check_table_exists(table_name).await
  }

  /// Check if a table exists in the database
  async fn check_table_exists(&self, table_name: &str) -> Result<bool> {
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


  /// Initialize polling state for a specific polling job
  pub async fn initialize_job_polling_state(&self, job_name: &str, query_name: &str, queue_position: i32) -> Result<()> {
    // Check if state already exists for this job
    let existing_state = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#
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
        "#
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
        INSERT INTO atomic_data_polling_state (job_name, query_name, last_processed_block_height, last_poll_time, queue_position)
        VALUES ($1, $2, $3, NOW(), $4)
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

  /// Get pending changes from the next job in the sequential queue
  pub async fn get_all_polling_job_changes(&self, current_solana_height: u64) -> Result<Vec<ChangeRecord>> {
    // First check if any job is currently running to prevent job spamming
    if self.is_any_job_running().await? {
      debug!("A job is already running, skipping queue processing to prevent job spamming");
      return Ok(vec![]);
    }

    // Get the next job in the queue that should be processed
    if let Some(job) = self.get_next_queue_job().await? {
      info!("Processing next job in queue: '{}'", job.name);

      let changes = self.poll_job_changes(&job, current_solana_height).await?;

      // If this job completed successfully (no errors), mark it as completed and move to next
      if !changes.is_empty() {
        info!("Job '{}' found {} changes, marking as completed in queue", job.name, changes.len());
        self.mark_job_queue_completed(&job.name, &job.query_name).await?;
      } else {
        // If no changes, still mark as completed to move to next job
        debug!("Job '{}' found no changes, marking as completed in queue", job.name);
        self.mark_job_queue_completed(&job.name, &job.query_name).await?;
      }

      Ok(changes)
    } else {
      // No jobs in queue or all completed - reset queue for next cycle
      debug!("No more jobs in queue, resetting for next cycle");
      self.reset_job_queue().await?;
      Ok(vec![])
    }
  }

  /// Poll for changes in a specific polling job
  async fn poll_job_changes(&self, job: &PollingJob, current_solana_height: u64) -> Result<Vec<ChangeRecord>> {
    // Check if this job is already running
    if self.is_job_running(&job.name, &job.query_name).await? {
      debug!(
        "Job '{}' query '{}' is already running, skipping this poll cycle",
        job.name, job.query_name
      );
      return Ok(vec![]);
    }

    // Try to mark this job as running
    if !self.mark_job_running(&job.name, &job.query_name).await? {
      debug!(
        "Failed to mark job '{}' query '{}' as running (race condition), skipping this poll cycle",
        job.name, job.query_name
      );
      return Ok(vec![]);
    }

    // Execute the actual polling logic and ensure cleanup on exit
    let result = self.execute_job_polling(job, current_solana_height).await;

    // Always mark job as not running, regardless of success or failure
    if let Err(e) = self.mark_job_not_running(&job.name, &job.query_name).await {
      warn!("Failed to mark job '{}' query '{}' as not running: {}", job.name, job.query_name, e);
    }

    result
  }

  /// Execute the actual polling logic for a job (internal method)
  async fn execute_job_polling(&self, job: &PollingJob, current_solana_height: u64) -> Result<Vec<ChangeRecord>> {
    // Get current polling state from database
    let current_state_row = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#
    )
    .bind(&job.name)
    .bind(&job.query_name)
    .fetch_one(&self.pool)
    .await?;

    let last_processed_height: i64 = current_state_row.get("last_processed_block_height");

    // Get the query from the queries module
    let query = crate::queries::AtomicHotspotQueries::get_query(&job.query_name)
      .ok_or_else(|| anyhow::anyhow!("{} query not found", job.query_name))?;

    // Extract hotspot_type from parameters
    let hotspot_type = job.parameters.get("hotspot_type")
      .and_then(|v| v.as_str())
      .ok_or_else(|| anyhow::anyhow!("hotspot_type parameter required"))?;

    info!(
      "Querying job '{}' with query '{}' for hotspot_type '{}', last_processed: {}, current_solana: {}",
      job.name, job.query_name, hotspot_type, last_processed_height, current_solana_height
    );

    let rows = sqlx::query(query)
      .bind(hotspot_type)
      .bind(last_processed_height)
      .bind(current_solana_height as i64)
      .fetch_all(&self.pool)
      .await?;

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

    info!("Found {} changes for job '{}'", changes.len(), job.name);
    Ok(changes)
  }

  // Legacy methods removed - polling jobs use simplified direct query execution

  /// Mark changes as processed by updating the polling state with current Solana block height
  /// Updates last_processed_block_height to the current Solana block height to track progress properly
  pub async fn mark_changes_processed(&self, changes: &[ChangeRecord], current_solana_height: u64) -> Result<()> {
    if changes.is_empty() {
      return Ok(());
    }

    // Group changes by table to update polling state for each
    let mut processed_tables = std::collections::HashSet::new();

    debug!("Marking {} changes as processed with Solana height {}", changes.len(), current_solana_height);
    for change in changes {
      processed_tables.insert(change.job_name.clone());
    }

    // Update polling state for each job with the current Solana block height
    for job_name in processed_tables {
      // Find the corresponding polling job to get the query name
      if let Some(job) = self.polling_jobs.iter().find(|j| j.name == job_name) {
        // Update to current Solana block height - this ensures we don't reprocess records up to this point
        sqlx::query(
          r#"
          UPDATE atomic_data_polling_state
          SET
            last_processed_block_height = $1,
            last_poll_time = NOW(),
            updated_at = NOW()
          WHERE job_name = $2 AND query_name = $3
          "#
        )
        .bind(current_solana_height as i64)
        .bind(&job.name)
        .bind(&job.query_name)
        .execute(&self.pool)
        .await?;

        info!(
          "Updated polling state for job '{}' query '{}': last_processed_block_height -> {} (current Solana height)",
          job.name, job.query_name, current_solana_height
        );
      } else {
        warn!("No polling job configuration found for job name: {}", job_name);
      }
    }

    debug!("Marked {} changes as processed with Solana height {}", changes.len(), current_solana_height);
    Ok(())
  }

  /// Health check - verify database connectivity
  pub async fn health_check(&self) -> Result<()> {
    sqlx::query("SELECT 1").execute(&self.pool).await?;
    Ok(())
  }

  /// Check if ANY job is currently running (to prevent job spamming)
  async fn is_any_job_running(&self) -> Result<bool> {
    let row = sqlx::query(
      r#"
      SELECT COUNT(*) as running_count
      FROM atomic_data_polling_state
      WHERE is_running = TRUE
      "#
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

  /// Check if a job is currently running
  pub async fn is_job_running(&self, job_name: &str, query_name: &str) -> Result<bool> {
    let row = sqlx::query(
      r#"
      SELECT is_running, running_since
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#
    )
    .bind(job_name)
    .bind(query_name)
    .fetch_optional(&self.pool)
    .await?;

    if let Some(row) = row {
      let is_running: bool = row.get("is_running");
      let running_since: Option<DateTime<Utc>> = row.get("running_since");

      if is_running {
        // Check if the job has been running for too long (stale state)
        if let Some(since) = running_since {
          let stale_threshold = chrono::Utc::now() - chrono::Duration::minutes(30);
          if since < stale_threshold {
            warn!(
              "Job '{}' query '{}' appears to be stale (running since {}), marking as not running",
              job_name, query_name, since
            );
            self.mark_job_not_running(job_name, query_name).await?;
            return Ok(false);
          }
        }

        debug!(
          "Job '{}' query '{}' is currently running (since: {:?})",
          job_name, query_name, running_since
        );
        return Ok(true);
      }
    }

    Ok(false)
  }

  /// Mark a job as running
  pub async fn mark_job_running(&self, job_name: &str, query_name: &str) -> Result<bool> {
    // Use a transaction to atomically check and set running state
    let mut tx = self.pool.begin().await?;

    // Check if already running
    let existing = sqlx::query(
      r#"
      SELECT is_running
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      FOR UPDATE
      "#
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
        debug!("Job '{}' query '{}' is already running", job_name, query_name);
        return Ok(false);
      }
    }

    // Mark as running
    let result = sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = TRUE,
        running_since = NOW(),
        updated_at = NOW()
      WHERE job_name = $1 AND query_name = $2
      "#
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

  /// Mark a job as not running
  pub async fn mark_job_not_running(&self, job_name: &str, query_name: &str) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = FALSE,
        running_since = NULL,
        updated_at = NOW()
      WHERE job_name = $1 AND query_name = $2
      "#
    )
    .bind(job_name)
    .bind(query_name)
    .execute(&self.pool)
    .await?;

    debug!("Marked job '{}' query '{}' as not running", job_name, query_name);
    Ok(())
  }

  /// Get the next job in the sequential queue that should be processed
  async fn get_next_queue_job(&self) -> Result<Option<PollingJob>> {
    // Get the job with the lowest queue_position that hasn't been completed yet
    let row = sqlx::query(
      r#"
      SELECT job_name, query_name
      FROM atomic_data_polling_state
      WHERE queue_completed_at IS NULL
      ORDER BY queue_position ASC
      LIMIT 1
      "#
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

      warn!("Job '{}' query '{}' found in queue but not in configuration", job_name, query_name);
    }

    Ok(None)
  }

  /// Mark a job as completed in the queue
  async fn mark_job_queue_completed(&self, job_name: &str, query_name: &str) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        queue_completed_at = NOW(),
        updated_at = NOW()
      WHERE job_name = $1 AND query_name = $2
      "#
    )
    .bind(job_name)
    .bind(query_name)
    .execute(&self.pool)
    .await?;

    debug!("Marked job '{}' query '{}' as completed in queue", job_name, query_name);
    Ok(())
  }

  /// Reset the job queue for a new cycle (mark all jobs as not completed)
  async fn reset_job_queue(&self) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        queue_completed_at = NULL,
        updated_at = NOW()
      "#
    )
    .execute(&self.pool)
    .await?;

    info!("Reset job queue - all jobs marked as not completed for new cycle");
    Ok(())
  }

  /// Get current queue status for debugging (public method for visibility)
  pub async fn get_queue_status(&self) -> Result<Vec<(String, i32, bool)>> {
    let rows = sqlx::query(
      r#"
      SELECT job_name, queue_position, (queue_completed_at IS NOT NULL) as completed
      FROM atomic_data_polling_state
      ORDER BY queue_position ASC
      "#
    )
    .fetch_all(&self.pool)
    .await?;

    let mut status = Vec::new();
    for row in rows {
      let job_name: String = row.get("job_name");
      let queue_position: i32 = row.get("queue_position");
      let completed: bool = row.get("completed");
      status.push((job_name, queue_position, completed));
    }

    Ok(status)
  }

  /// Cleanup stale running states on startup
  pub async fn cleanup_stale_running_states(&self) -> Result<()> {
    let stale_threshold = chrono::Utc::now() - chrono::Duration::minutes(30);

    let result = sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = FALSE,
        running_since = NULL,
        updated_at = NOW()
      WHERE is_running = TRUE
        AND (running_since IS NULL OR running_since < $1)
      "#
    )
    .bind(stale_threshold)
    .execute(&self.pool)
    .await?;

    if result.rows_affected() > 0 {
      info!("Cleaned up {} stale running job states", result.rows_affected());
    }

    Ok(())
  }

  /// Cleanup ALL running states during shutdown (regardless of time)
  pub async fn cleanup_all_running_states(&self) -> Result<()> {
    let result = sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        is_running = FALSE,
        running_since = NULL,
        updated_at = NOW()
      WHERE is_running = TRUE
      "#
    )
    .execute(&self.pool)
    .await?;

    if result.rows_affected() > 0 {
      info!("Cleaned up {} running job states during shutdown", result.rows_affected());
    } else {
      info!("No running job states to clean up");
    }

    Ok(())
  }
}
