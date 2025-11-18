use anyhow::Result;
use aws_sdk_rds::auth_token::AuthTokenGenerator;
use chrono::{Duration, Utc};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    PgPool, Row,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use crate::{
    config::{DatabaseConfig, PollingJob},
    errors::AtomicDataError,
    metrics,
};

const MIN_CHUNK_SIZE: u64 = 50_000;
const MAX_CHUNK_SIZE: u64 = 500_000;
pub const BATCH_SIZE: usize = 1_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
  pub job_name: String,
  pub query_name: String,
  pub target_block: u64,
  pub atomic_data: serde_json::Value,
}

#[derive(Debug)]
pub struct DatabaseClient {
  pool: Arc<RwLock<Arc<PgPool>>>,
  config: DatabaseConfig,
  polling_jobs: Vec<PollingJob>,
  dry_run: bool,
}

impl DatabaseClient {
  pub async fn new(config: &DatabaseConfig, polling_jobs: Vec<PollingJob>, dry_run: bool) -> Result<Self> {
    Self::validate_database_config(config)?;
    Self::validate_polling_jobs(&polling_jobs)?;

    let pool = Self::create_pool(config, dry_run).await?;
    let pool = Arc::new(RwLock::new(Arc::new(pool)));

    Ok(Self {
      pool,
      config: config.clone(),
      polling_jobs,
      dry_run,
    })
  }

  async fn create_pool(config: &DatabaseConfig, dry_run: bool) -> Result<PgPool> {
    let is_rds = config.host.contains("rds.amazonaws.com");
    let password = if is_rds && config.password.is_empty() {
      info!("Detected AWS RDS connection, generating IAM auth token");
      Self::generate_rds_auth_token(config).await?
    } else {
      config.password.clone()
    };

    let mut connect_options = PgConnectOptions::new()
      .host(&config.host)
      .port(config.port)
      .username(&config.username)
      .database(&config.database_name);

    if let Some(ssl_mode) = &config.ssl_mode {
      connect_options = connect_options.ssl_mode(ssl_mode.parse()?);
    }

    if !password.is_empty() {
      connect_options = connect_options.password(&password);
    }

    let statement_timeout_ms = config.statement_timeout_seconds * 1000;
    let lock_timeout_ms = std::cmp::min(statement_timeout_ms, 30_000); // Max 30s to wait for row locks
    connect_options = connect_options
      .application_name("atomic-data-publisher")
      .options([
        ("statement_timeout", statement_timeout_ms.to_string().as_str()),
        ("lock_timeout", lock_timeout_ms.to_string().as_str()),
        ("tcp_keepalives_idle", "60"),
        ("tcp_keepalives_interval", "10"),
        ("tcp_keepalives_count", "6"),
      ]);

    // IAM auth tokens expire after 15 minutes, so force shorter connection lifetimes
    // to ensure connections are recycled before token expiration
    let (max_lifetime, idle_timeout) = if is_rds && config.password.is_empty() {
      let iam_safe_lifetime = 600; // 10 minutes, well before 15 min token expiry
      let iam_safe_idle = 300; // 5 minutes
      info!("Using IAM auth - setting max_lifetime to {}s and idle_timeout to {}s to prevent token expiration",
            iam_safe_lifetime, iam_safe_idle);
      (
        std::cmp::min(config.max_lifetime_seconds, iam_safe_lifetime),
        std::cmp::min(config.idle_timeout_seconds, iam_safe_idle)
      )
    } else {
      (config.max_lifetime_seconds, config.idle_timeout_seconds)
    };

    let pool = PgPoolOptions::new()
      .max_connections(config.max_connections)
      .min_connections(config.min_connections)
      .acquire_timeout(std::time::Duration::from_secs(
        config.acquire_timeout_seconds,
      ))
      .idle_timeout(std::time::Duration::from_secs(idle_timeout))
      .max_lifetime(std::time::Duration::from_secs(max_lifetime))
      .connect_with(connect_options)
      .await?;

    sqlx::query("SELECT 1").execute(&pool).await?;

    info!(
      "Connected to database at {}:{}/{} (ssl_mode: {:?}, auth: {}, dry_run: {}, max_lifetime: {}s, idle_timeout: {}s, statement_timeout: {}s, lock_timeout: {}s, tcp_keepalive: 60s)",
      config.host, config.port, config.database_name, config.ssl_mode,
      if is_rds && config.password.is_empty() { "IAM" } else { "password" },
      dry_run, max_lifetime, idle_timeout, config.statement_timeout_seconds, lock_timeout_ms / 1000
    );

    Ok(pool)
  }

  /// Recreates the database pool with a fresh IAM auth token (if using IAM auth)
  pub async fn refresh_pool(&self) -> Result<()> {
    let is_rds = self.config.host.contains("rds.amazonaws.com");
    if is_rds && self.config.password.is_empty() {
      info!("Refreshing database pool with new IAM auth token");

      // Retry pool refresh up to 3 times with exponential backoff
      let mut last_error = None;
      for attempt in 1..=3 {
        match Self::create_pool(&self.config, self.dry_run).await {
          Ok(new_pool) => {
            let new_pool_arc = Arc::new(new_pool);
            let old_pool = {
              let mut pool_write = self.pool.write().await;
              let old = std::mem::replace(&mut *pool_write, new_pool_arc);
              old
            }; // Write lock dropped here

            // Close old pool gracefully in background - don't block on it
            tokio::spawn(async move {
              old_pool.close().await;
              debug!("Old database pool closed");
            });

            info!("Database pool refreshed successfully on attempt {}", attempt);
            return Ok(());
          }
          Err(e) => {
            warn!("Failed to refresh database pool (attempt {}): {}", attempt, e);
            last_error = Some(e);
            if attempt < 3 {
              tokio::time::sleep(std::time::Duration::from_secs(attempt * 2)).await;
            }
          }
        }
      }

      if let Some(e) = last_error {
        error!("Failed to refresh database pool after 3 attempts");
        return Err(e);
      }
    }
    Ok(())
  }

  /// Check if an error is likely an IAM authentication error
  pub fn is_auth_error(err: &sqlx::Error) -> bool {
    match err {
      sqlx::Error::Database(db_err) => {
        let msg = db_err.message().to_lowercase();
        msg.contains("authentication")
          || msg.contains("password authentication failed")
          || msg.contains("no password supplied")
          || msg.contains("connection refused")
      }
      _ => false,
    }
  }

  async fn generate_rds_auth_token(config: &DatabaseConfig) -> Result<String> {
    let region = config
      .aws_region
      .as_ref()
      .ok_or_else(|| anyhow::anyhow!("AWS_REGION required for RDS IAM authentication"))?;

    let aws_config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let credentials_provider = aws_config
      .credentials_provider()
      .ok_or_else(|| anyhow::anyhow!("No AWS credentials found"))?;

    let auth_token_config = aws_sdk_rds::auth_token::Config::builder()
      .hostname(&config.host)
      .port(u64::from(config.port))
      .username(&config.username)
      .region(aws_sdk_rds::config::Region::new(region.clone()))
      .credentials(credentials_provider.clone())
      .build()
      .map_err(|e| anyhow::anyhow!("Failed to build auth token config: {}", e))?;

    let auth_token = AuthTokenGenerator::new(auth_token_config)
      .auth_token(&aws_config)
      .await
      .map_err(|e| anyhow::anyhow!("Failed to generate auth token: {}", e))?;

    Ok(auth_token.to_string())
  }

  pub fn validate_database_config(config: &DatabaseConfig) -> Result<()> {
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
      anyhow::bail!("Database max_connections must be greater than 0, got: {}", config.max_connections);
    }
    if config.max_connections < config.min_connections {
      anyhow::bail!(
        "Database max_connections ({}) must be >= min_connections ({})",
        config.max_connections,
        config.min_connections
      );
    }
    Ok(())
  }

  pub fn validate_polling_jobs(jobs: &[PollingJob]) -> Result<()> {
    if jobs.is_empty() {
      warn!("No polling jobs configured - service will not process any changes");
      return Ok(());
    }

    for (index, job) in jobs.iter().enumerate() {
      if job.name.is_empty() {
        anyhow::bail!("Job {}: name cannot be empty", index);
      }
      if job.query_name.is_empty() {
        anyhow::bail!(
          "Job '{}' (index {}): query_name cannot be empty",
          job.name,
          index
        );
      }
      if !job.parameters.is_object() {
        anyhow::bail!(
          "Job '{}' (index {}): parameters must be a valid JSON object",
          job.name,
          index
        );
      }

      // Validate query name exists
      if let Err(e) = crate::queries::AtomicHotspotQueries::validate_query_name(&job.query_name) {
        anyhow::bail!("Job '{}' (index {}): query validation failed: {}", job.name, index, e);
      }

      // Query-specific parameter validation
      if job.query_name == "construct_atomic_hotspots"
        && job.parameters.get("hotspot_type").is_none()
      {
        anyhow::bail!("Job '{}' (index {}): hotspot_type parameter is required for construct_atomic_hotspots queries",
                     job.name, index);
      }

      // Validate change_type parameter exists for all jobs
      if job.parameters.get("change_type").is_none() {
        anyhow::bail!("Job '{}' (index {}): change_type parameter is required", job.name, index);
      }
    }

    Ok(())
  }

  pub async fn init_polling_state(&self) -> Result<()> {
    self.create_state_tables().await?;
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

  pub async fn create_state_tables(&self) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let create_table_query = r#"
      CREATE TABLE IF NOT EXISTS atomic_data_polling_state (
        job_name VARCHAR(255) NOT NULL UNIQUE,
        query_name VARCHAR(255) NOT NULL DEFAULT 'default',
        queue_position INTEGER NOT NULL DEFAULT 0,
        last_processed_block BIGINT DEFAULT NULL,
        dry_run_last_processed_block BIGINT DEFAULT NULL,
        is_running BOOLEAN NOT NULL DEFAULT FALSE,
        running_since TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        queue_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_max_block BIGINT DEFAULT NULL,
        PRIMARY KEY (job_name, query_name)
      )
    "#;

    sqlx::query(create_table_query).execute(&*pool).await?;

    let create_index_query = r#"
      CREATE INDEX IF NOT EXISTS idx_polling_state_updated_at
      ON atomic_data_polling_state (updated_at)
    "#;
    sqlx::query(create_index_query).execute(&*pool).await?;

    let create_queue_index_query = r#"
      CREATE INDEX IF NOT EXISTS idx_polling_state_queue_position
      ON atomic_data_polling_state (queue_position, queue_completed_at)
    "#;
    sqlx::query(create_queue_index_query)
      .execute(&*pool)
      .await?;

    info!("Created or verified atomic_data_polling_state table");

    let create_failed_records_table = r#"
      CREATE TABLE IF NOT EXISTS atomic_data_failed_records (
        id SERIAL PRIMARY KEY,
        job_name VARCHAR(255) NOT NULL,
        query_name VARCHAR(255) NOT NULL,
        record_hash TEXT NOT NULL,
        error_type VARCHAR(255) NOT NULL,
        error_message TEXT NOT NULL,
        target_block BIGINT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 1,
        first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        atomic_data JSONB,
        UNIQUE(job_name, query_name, record_hash)
      )
    "#;

    sqlx::query(create_failed_records_table).execute(&*pool).await?;

    let create_failed_records_index = r#"
      CREATE INDEX IF NOT EXISTS idx_failed_records_lookup
      ON atomic_data_failed_records (job_name, query_name, record_hash)
    "#;
    sqlx::query(create_failed_records_index).execute(&*pool).await?;

    let create_failed_records_time_index = r#"
      CREATE INDEX IF NOT EXISTS idx_failed_records_last_failed
      ON atomic_data_failed_records (last_failed_at)
    "#;
    sqlx::query(create_failed_records_time_index).execute(&*pool).await?;

    info!("Created or verified atomic_data_failed_records table");

    Ok(())
  }

  pub async fn table_exists(&self, table_name: &str) -> Result<bool> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let query = r#"
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      );
    "#;

    let row = sqlx::query(query)
      .bind(table_name)
      .fetch_one(&*pool)
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
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let existing_state = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block,
        dry_run_last_processed_block,
        last_max_block
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(job_name)
    .bind(query_name)
    .fetch_optional(&*pool)
    .await?;

    if let Some(row) = existing_state {
      let block: Option<i64> = row.get("last_processed_block");
      let dry_run_block: Option<i64> = row.get("dry_run_last_processed_block");
      let max_block: Option<i64> = row.get("last_max_block");

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
      .execute(&*pool)
      .await?;

      match (block, dry_run_block) {
        (Some(b), Some(db)) => info!(
          "Resuming polling for job '{}' query '{}' from block {} (dry_run: {}, last_max: {:?}) with queue position {}",
          job_name, query_name, b, db, max_block, queue_position
        ),
        (Some(b), None) => info!(
          "Resuming polling for job '{}' query '{}' from block {} (last_max: {:?}) with queue position {}",
          job_name, query_name, b, max_block, queue_position
        ),
        (None, Some(db)) => info!(
          "Resuming polling for job '{}' query '{}' from start (dry_run: {}, last_max: {:?}) with queue position {}",
          job_name, query_name, db, max_block, queue_position
        ),
        (None, None) => info!(
          "Resuming polling for job '{}' query '{}' from start (NULL) with queue position {}",
          job_name, query_name, queue_position
        ),
      }
    } else {
      sqlx::query(
        r#"
        INSERT INTO atomic_data_polling_state (job_name, query_name, last_processed_block, dry_run_last_processed_block, queue_position)
        VALUES ($1, $2, $3, $4, $5)
        "#
      )
      .bind(job_name)
      .bind(query_name)
      .bind(None::<i64>)
      .bind(None::<i64>)
      .bind(queue_position)
      .execute(&*pool)
      .await?;

      info!(
        "Initialized new polling state for job '{}' query '{}' starting from NULL (will process from block 0) with queue position {}",
        job_name, query_name, queue_position
      );
    }

    Ok(())
  }

  pub async fn get_pending_changes(&self) -> Result<Vec<ChangeRecord>> {
    loop {
      if let Some(job) = self.get_next_queue_job().await? {
        if !self.mark_job_running(&job.name, &job.query_name).await? {
          continue; // Try next job if this one couldn't be marked as running
        }

        match self.execute_job_polling(&job).await {
          Ok(change_records) => {
            // If no data found, mark job as completed and not running, then continue to next job
            if change_records.is_empty() {
              info!(
                "No data found for job '{}', marking as completed and continuing to next job",
                job.name
              );
              let _ = self.mark_job_not_running(&job.name, &job.query_name).await;
              let _ = self.mark_completed(&job.name, &job.query_name).await;
              continue; // Continue to next job in the same cycle
            }

            // Found a job with data - return all records for processing
            return Ok(change_records);
          }
          Err(e) => {
            let _ = self.mark_job_not_running(&job.name, &job.query_name).await;
            return Err(e.into());
          }
        }
      } else {
        // No more jobs available, reset queue for next cycle
        self.reset_job_queue().await?;
        break;
      }
    }

    Ok(Vec::new())
  }

  async fn execute_job_polling(
    &self,
    job: &PollingJob,
  ) -> Result<Vec<ChangeRecord>, AtomicDataError> {
    let (last_processed_block_opt, max_available_block) = self.get_polling_bounds(job).await?;
    let should_skip = match last_processed_block_opt {
      None => false,
      Some(last_processed) => max_available_block <= last_processed as u64,
    };

    if should_skip {
      return Ok(Vec::new());
    }

    let last_processed_block_u64 = last_processed_block_opt.unwrap_or(0) as u64;
    let next_data_block = self.get_next_data_block_after(job, last_processed_block_u64).await?;

    let target_block = if let Some(next_block) = next_data_block {
      let gap_size = next_block.saturating_sub(last_processed_block_u64);
      if gap_size > MAX_CHUNK_SIZE * 2 {
        let skip_to = next_block.saturating_sub(1);
        info!(
          "Job '{}': Large block range detected ({} blocks), setting target_block to {} to process all available data",
          job.name, gap_size, skip_to
        );
        std::cmp::min(skip_to, max_available_block)
      } else {
        self.calculate_target_block(last_processed_block_u64, max_available_block)
      }
    } else {
      self.calculate_target_block(last_processed_block_u64, max_available_block)
    };

    let query_last_block = last_processed_block_opt.unwrap_or(-1);
    let query_results = self
      .execute_query(job, query_last_block, target_block)
      .await?;
    let change_records = self.process_query_results(&query_results, job, target_block);

    if !change_records.is_empty() {
      info!(
        "Found {} items for job '{}' (processed up to block {})",
        change_records.len(),
        job.name,
        target_block
      );
    } else {
      info!(
        "No changes found for job '{}' (processed up to block {})",
        job.name, target_block
      );
      self
        .advance_block_for_job(&job.name, &job.query_name, target_block)
        .await?;
    }

    Ok(change_records)
  }

  /// Get the polling bounds (last processed block and max available block) for a job
  /// Returns (last_processed_block as Option<i64> from DB, max_available_block as u64)
  async fn get_polling_bounds(&self, job: &PollingJob) -> Result<(Option<i64>, u64), AtomicDataError> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let current_state_row = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        last_processed_block,
        dry_run_last_processed_block,
        last_max_block
      FROM atomic_data_polling_state
      WHERE job_name = $1 AND query_name = $2
      "#,
    )
    .bind(&job.name)
    .bind(&job.query_name)
    .fetch_one(&*pool)
    .await?;

    // Use dry_run_last_processed_block if in dry_run mode, otherwise use last_processed_block
    // But last_max_block is shared - it tracks the source data, not processing state
    let last_processed_block: Option<i64> = if self.dry_run {
      current_state_row.get("dry_run_last_processed_block")
    } else {
      current_state_row.get("last_processed_block")
    };
    let last_max_block: Option<i64> = current_state_row.get("last_max_block");
    let current_max_block = match self
      .get_max_block_for_query(&job.query_name, &job.parameters)
      .await?
    {
      Some(block) => block,
      None => {
        // No new changes in source tables - return bounds that indicate nothing to process
        debug!(
          "No data available yet for job '{}' query '{}' - source tables empty",
          job.name, job.query_name
        );
        return Ok((last_processed_block, 0));
      }
    };

    // Get the min block for this table and use it if it's greater than last_processed_block
    let min_block = self
      .get_min_block_for_query(&job.query_name, &job.parameters)
      .await?
      .unwrap_or(0);

    // Convert last_processed_block to u64 for calculations, treating NULL as 0
    let last_processed_block_u64 = last_processed_block.unwrap_or(0) as u64;
    let effective_start_block = std::cmp::max(min_block, last_processed_block_u64);
    let max_available_block = self
      .apply_safety_buffer_and_track_progress(
        &job.name,
        &job.query_name,
        current_max_block,
        effective_start_block,
        last_max_block.map(|b| b as u64),
      )
      .await?;

    // Return the actual Option<i64> value from DB (which may be NULL) for use in SQL queries
    Ok((last_processed_block, max_available_block))
  }

  async fn apply_safety_buffer_and_track_progress(
    &self,
    job_name: &str,
    query_name: &str,
    current_max_block: u64,
    last_processed_block: u64,
    last_max_block: Option<u64>,
  ) -> Result<u64, AtomicDataError> {
    let safe_max_block = if current_max_block > 1 {
      current_max_block - 1
    } else {
      current_max_block
    };

    // If max block changed, update tracking and use safe max
    let max_block_changed = last_max_block != Some(current_max_block);
    if max_block_changed {
      self
        .update_max_block_tracking(job_name, query_name, current_max_block)
        .await?;
      return Ok(safe_max_block);
    }

    // If we haven't caught up to the safe max block yet, continue processing
    if last_processed_block < safe_max_block {
      return Ok(safe_max_block);
    }

    // We've seen this max block before and caught up to safe_max_block
    // Process the final block to complete this range
    if last_processed_block < current_max_block {
      info!(
        "Job '{}' encountered same max_block {} on sequential run, processing final block {} to {}",
        job_name, current_max_block, last_processed_block, current_max_block
      );
      return Ok(current_max_block);
    }

    // We're fully caught up (last_processed_block >= current_max_block), nothing to do
    Ok(current_max_block)
  }

  async fn update_max_block_tracking(
    &self,
    job_name: &str,
    query_name: &str,
    max_block: u64,
  ) -> Result<(), AtomicDataError> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    // last_max_block tracks the source data state, shared across both modes
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        last_max_block = $1,
        updated_at = NOW()
      WHERE job_name = $2 AND query_name = $3
      "#,
    )
    .bind(max_block as i64)
    .bind(job_name)
    .bind(query_name)
    .execute(&*pool)
    .await?;

    Ok(())
  }

  fn calculate_target_block(&self, last_processed_block: u64, max_available_block: u64) -> u64 {
    let block_diff = max_available_block.saturating_sub(last_processed_block);

    let chunk_size = if block_diff <= MIN_CHUNK_SIZE {
      block_diff
    } else {
      block_diff.min(MAX_CHUNK_SIZE)
    };

    std::cmp::min(last_processed_block + chunk_size, max_available_block)
  }

  async fn execute_query(
    &self,
    job: &PollingJob,
    last_processed_block: i64,
    target_block: u64,
  ) -> Result<Vec<sqlx::postgres::PgRow>, AtomicDataError> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };

    crate::queries::AtomicHotspotQueries::validate_query_name(&job.query_name).map_err(|e| {
      AtomicDataError::QueryValidationError(format!(
        "Query validation failed for '{}': {}",
        job.query_name, e
      ))
    })?;

    let query =
      crate::queries::AtomicHotspotQueries::get_query(&job.query_name).ok_or_else(|| {
        AtomicDataError::QueryValidationError(format!("Query not found for '{}'", job.query_name))
      })?;

    let query_start = std::time::Instant::now();
    let rows = tokio::time::timeout(
      std::time::Duration::from_secs(self.config.statement_timeout_seconds),
      self.execute_query_inner(job, query, last_processed_block, target_block, &pool)
    )
    .await
    .map_err(|_| {
      error!(
        "Query timeout after {}s for job '{}' query '{}' (blocks {} to {})",
        self.config.statement_timeout_seconds, job.name, job.query_name, last_processed_block, target_block
      );
      AtomicDataError::DatabaseError(sqlx::Error::PoolTimedOut)
    })??;

    let query_duration = query_start.elapsed().as_secs_f64();
    metrics::observe_database_query_duration(query_duration);

    Ok(rows)
  }

  async fn execute_query_inner(
    &self,
    job: &PollingJob,
    query: &str,
    last_processed_block: i64,
    target_block: u64,
    pool: &PgPool,
  ) -> Result<Vec<sqlx::postgres::PgRow>, AtomicDataError> {
    let mut rows = Vec::with_capacity(BATCH_SIZE);

    if job.query_name == "construct_atomic_hotspots" {
      let hotspot_type = job
        .parameters
        .get("hotspot_type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
          AtomicDataError::InvalidData(
            "hotspot_type parameter required for hotspot queries".to_string(),
          )
        })?;

      match hotspot_type {
        "iot" | "mobile" => {}
        _ => {
          return Err(AtomicDataError::InvalidData(format!(
            "Invalid hotspot_type: '{}'. Must be 'iot' or 'mobile'",
            hotspot_type
          )))
        }
      }

      let blocks_span = if last_processed_block < 0 {
        target_block + 1
      } else {
        target_block.saturating_sub(last_processed_block as u64)
      };

      let last_block_display = if last_processed_block < 0 { "NULL".to_string() } else { last_processed_block.to_string() };
      info!(
        "Querying job '{}' with query '{}' for hotspot_type '{}', processing blocks > {} to {} ({} blocks)",
        job.name, job.query_name, hotspot_type, last_block_display, target_block, blocks_span
      );

      let mut stream = sqlx::query(query)
        .bind(hotspot_type)
        .bind(last_processed_block)
        .bind(target_block as i64)
        .fetch(pool);

      let mut row_count = 0;
      while let Some(row_result) = stream.next().await {
        rows.push(row_result?);
        row_count += 1;

        if row_count % 10_000 == 0 {
          debug!("Streamed {} rows for job '{}'", row_count, job.name);
        }
      }

      if row_count > 0 {
        debug!("Streamed {} total rows for job '{}'", row_count, job.name);
      }
    } else {
      let blocks_span = if last_processed_block < 0 {
        target_block + 1
      } else {
        target_block.saturating_sub(last_processed_block as u64)
      };

      let last_block_display = if last_processed_block < 0 { "NULL".to_string() } else { last_processed_block.to_string() };
      info!(
        "Querying job '{}' with query '{}', processing blocks > {} to {} ({} blocks)",
        job.name,
        job.query_name,
        last_block_display,
        target_block,
        blocks_span
      );

      let mut stream = sqlx::query(query)
        .bind(last_processed_block)
        .bind(target_block as i64)
        .fetch(pool);

      let mut row_count = 0;
      while let Some(row_result) = stream.next().await {
        rows.push(row_result?);
        row_count += 1;

        if row_count % 10_000 == 0 {
          debug!("Streamed {} rows for job '{}'", row_count, job.name);
        }
      }

      if row_count > 0 {
        debug!("Streamed {} total rows for job '{}'", row_count, job.name);
      }
    }

    Ok(rows)
  }

  fn process_query_results(
    &self,
    rows: &[sqlx::postgres::PgRow],
    job: &PollingJob,
    target_block: u64,
  ) -> Vec<ChangeRecord> {
    rows
      .iter()
      .map(|row| ChangeRecord {
        job_name: job.name.clone(),
        query_name: job.query_name.clone(),
        target_block,
        atomic_data: row.get::<serde_json::Value, _>("atomic_data"),
      })
      .collect()
  }

  pub async fn mark_processed(&self, changes: &[ChangeRecord], target_block: u64) -> Result<()> {
    if changes.is_empty() {
      return self.advance_block_for_active_job(target_block).await;
    }

    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
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
        // Update the appropriate block counter based on dry_run mode
        let update_query = if self.dry_run {
          r#"
          UPDATE atomic_data_polling_state
          SET
            dry_run_last_processed_block = $1,
            updated_at = NOW()
          WHERE job_name = $2 AND query_name = $3
          "#
        } else {
          r#"
          UPDATE atomic_data_polling_state
          SET
            last_processed_block = $1,
            updated_at = NOW()
          WHERE job_name = $2 AND query_name = $3
          "#
        };

        sqlx::query(update_query)
          .bind(target_block as i64)
          .bind(&job.name)
          .bind(&job.query_name)
          .execute(&*pool)
          .await?;

        let block_type = if self.dry_run { "dry_run_last_processed_block" } else { "last_processed_block" };
        info!(
          "Updated polling state for job '{}' query '{}': {} -> {} (target height)",
          job.name, job.query_name, block_type, target_block
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

  async fn advance_block_for_job(
    &self,
    job_name: &str,
    query_name: &str,
    target_block: u64,
  ) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    // Update the appropriate block counter based on dry_run mode
    let update_query = if self.dry_run {
      r#"
      UPDATE atomic_data_polling_state
      SET
        dry_run_last_processed_block = $1,
        updated_at = NOW()
      WHERE job_name = $2 AND query_name = $3
      "#
    } else {
      r#"
      UPDATE atomic_data_polling_state
      SET
        last_processed_block = $1,
        updated_at = NOW()
      WHERE job_name = $2 AND query_name = $3
      "#
    };

    sqlx::query(update_query)
      .bind(target_block as i64)
      .bind(job_name)
      .bind(query_name)
      .execute(&*pool)
      .await?;

    let block_type = if self.dry_run { "dry_run_last_processed_block" } else { "last_processed_block" };
    debug!(
      "Advanced {} to {} for job '{}' query '{}' (no changes found, skipping gap)",
      block_type, target_block, job_name, query_name
    );

    Ok(())
  }

  async fn advance_block_for_active_job(&self, target_block: u64) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let active_job = sqlx::query(
      r#"
      SELECT job_name, query_name
      FROM atomic_data_polling_state
      WHERE is_running = TRUE
      LIMIT 1
      "#,
    )
    .fetch_optional(&*pool)
    .await?;

    if let Some(row) = active_job {
      let job_name: String = row.get("job_name");
      let query_name: String = row.get("query_name");

      self
        .advance_block_for_job(&job_name, &query_name, target_block)
        .await?;
    }

    Ok(())
  }

  pub async fn health_check(&self) -> Result<(), sqlx::Error> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    // Test basic connectivity
    sqlx::query("SELECT 1").execute(&*pool).await?;

    // Test that we can actually query the atomic_data table (our main table)
    sqlx::query("SELECT COUNT(*) FROM atomic_data_polling_state LIMIT 1")
      .execute(&*pool)
      .await?;

    // Check connection pool health
    if pool.size() == 0 {
      return Err(sqlx::Error::PoolTimedOut);
    }

    Ok(())
  }

  pub async fn test_connection(&self) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    tokio::time::timeout(
      std::time::Duration::from_secs(5),
      sqlx::query("SELECT 1").execute(&*pool)
    )
    .await
    .map_err(|_| anyhow::anyhow!("Database connection test timed out"))??;
    Ok(())
  }

  pub async fn get_max_block_for_query(
    &self,
    query_name: &str,
    parameters: &serde_json::Value,
  ) -> Result<Option<u64>> {
    self.get_block_for_query(query_name, parameters, true).await
  }

  pub async fn get_min_block_for_query(
    &self,
    query_name: &str,
    parameters: &serde_json::Value,
  ) -> Result<Option<u64>> {
    self.get_block_for_query(query_name, parameters, false).await
  }

  async fn get_block_for_query(
    &self,
    query_name: &str,
    parameters: &serde_json::Value,
    use_max: bool,
  ) -> Result<Option<u64>> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let block = match query_name {
      "construct_atomic_hotspots" => {
        let hotspot_type = parameters
          .get("hotspot_type")
          .and_then(|v| v.as_str())
          .ok_or_else(|| {
            AtomicDataError::ConfigError(config::ConfigError::Message(
              "hotspot_type parameter is required".to_string(),
            ))
          })?;

        let (_table_name, block, has_data) = match hotspot_type {
          "mobile" => {
            let query = if use_max {
              r#"SELECT COALESCE((SELECT MAX(last_block) FROM mobile_hotspot_infos), -1)::bigint as block"#
            } else {
              r#"SELECT COALESCE((SELECT MIN(last_block) FROM mobile_hotspot_infos), -1)::bigint as block"#
            };
            let row = sqlx::query(query).fetch_one(&*pool).await?;
            let block_value = row.get::<i64, _>("block");
            ("mobile_hotspot_infos", block_value, block_value >= 0)
          }
          "iot" => {
            let query = if use_max {
              r#"SELECT COALESCE((SELECT MAX(last_block) FROM iot_hotspot_infos), -1)::bigint as block"#
            } else {
              r#"SELECT COALESCE((SELECT MIN(last_block) FROM iot_hotspot_infos), -1)::bigint as block"#
            };
            let row = sqlx::query(query).fetch_one(&*pool).await?;
            let block_value = row.get::<i64, _>("block");
            ("iot_hotspot_infos", block_value, block_value >= 0)
          }
          _ => {
            return Err(anyhow::anyhow!(
              "Invalid hotspot_type: '{}'. Must be 'mobile' or 'iot'",
              hotspot_type
            ))
          }
        };

        let operation = if use_max { "Max" } else { "Min" };
        debug!(
          "{} last_block for {} hotspots: {}",
          operation, hotspot_type, block
        );

        if has_data {
          Some(block as u64)
        } else {
          None
        }
      }
      "construct_entity_ownership_changes" => {
        let query = if use_max {
          r#"
          SELECT GREATEST(
            COALESCE((SELECT MAX(last_block) FROM asset_owners), -1),
            COALESCE((SELECT MAX(last_block) FROM welcome_packs), -1)
          )::bigint as block
          "#
        } else {
          r#"
          SELECT LEAST(
            COALESCE((SELECT MIN(last_block) FROM asset_owners WHERE last_block >= 0), -1),
            COALESCE((SELECT MIN(last_block) FROM welcome_packs WHERE last_block >= 0), -1)
          )::bigint as block
          "#
        };
        let row = sqlx::query(query).fetch_one(&*pool).await?;

        let block: i64 = row.get("block");
        if block >= 0 {
          Some(block as u64)
        } else {
          None
        }
      }
      "construct_entity_reward_destination_changes" => {
        let query = if use_max {
          r#"
          SELECT GREATEST(
            COALESCE((SELECT MAX(last_block) FROM recipients), -1),
            COALESCE((SELECT MAX(last_block) FROM rewards_recipients), -1)
          )::bigint as block
          "#
        } else {
          r#"
          SELECT LEAST(
            COALESCE((SELECT MIN(last_block) FROM recipients WHERE last_block >= 0), -1),
            COALESCE((SELECT MIN(last_block) FROM rewards_recipients WHERE last_block >= 0), -1)
          )::bigint as block
          "#
        };
        let row = sqlx::query(query).fetch_one(&*pool).await?;

        let block: i64 = row.get("block");
        if block >= 0 {
          Some(block as u64)
        } else {
          None
        }
      }
      _ => {
        warn!("Unknown query name: {}", query_name);
        None
      }
    };

    let operation = if use_max { "Max" } else { "Min" };
    debug!(
      "{} last_block for query '{}': {:?}",
      operation, query_name, block
    );

    Ok(block)
  }

  async fn get_next_data_block_after(
    &self,
    job: &PollingJob,
    after_block: u64,
  ) -> Result<Option<u64>> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let block = match job.query_name.as_str() {
      "construct_atomic_hotspots" => {
        let hotspot_type = job.parameters
          .get("hotspot_type")
          .and_then(|v| v.as_str())
          .ok_or_else(|| {
            AtomicDataError::ConfigError(config::ConfigError::Message(
              "hotspot_type parameter is required".to_string(),
            ))
          })?;

        let query = match hotspot_type {
          "mobile" => {
            r#"SELECT MIN(last_block)::bigint as block FROM mobile_hotspot_infos WHERE last_block > $1"#
          }
          "iot" => {
            r#"SELECT MIN(last_block)::bigint as block FROM iot_hotspot_infos WHERE last_block > $1"#
          }
          _ => {
            return Err(anyhow::anyhow!(
              "Invalid hotspot_type: '{}'. Must be 'mobile' or 'iot'",
              hotspot_type
            ).into())
          }
        };

        let row = sqlx::query(query)
          .bind(after_block as i64)
          .fetch_one(&*pool)
          .await?;

        row.get::<Option<i64>, _>("block").map(|b| b as u64)
      }
      "construct_entity_ownership_changes" => {
        let query = r#"
          SELECT MIN(next_block)::bigint as block FROM (
            SELECT MIN(last_block) as next_block FROM asset_owners WHERE last_block > $1
            UNION ALL
            SELECT MIN(last_block) as next_block FROM welcome_packs WHERE last_block > $1
          ) combined WHERE next_block IS NOT NULL
        "#;

        let row = sqlx::query(query)
          .bind(after_block as i64)
          .fetch_one(&*pool)
          .await?;

        row.get::<Option<i64>, _>("block").map(|b| b as u64)
      }
      "construct_entity_reward_destination_changes" => {
        let query = r#"
          SELECT MIN(next_block)::bigint as block FROM (
            SELECT MIN(last_block) as next_block FROM recipients WHERE last_block > $1
            UNION ALL
            SELECT MIN(last_block) as next_block FROM rewards_recipients WHERE last_block > $1
          ) combined WHERE next_block IS NOT NULL
        "#;

        let row = sqlx::query(query)
          .bind(after_block as i64)
          .fetch_one(&*pool)
          .await?;

        row.get::<Option<i64>, _>("block").map(|b| b as u64)
      }
      _ => {
        debug!("Unknown query name for next block lookup: {}", job.query_name);
        None
      }
    };

    if let Some(next_block) = block {
      debug!(
        "Next data block after {} for query '{}': {}",
        after_block, job.query_name, next_block
      );
    }

    Ok(block)
  }

  pub async fn any_job_running(&self) -> Result<bool> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let row = sqlx::query(
      r#"
      SELECT COUNT(*) as running_count
      FROM atomic_data_polling_state
      WHERE is_running = TRUE
      "#,
    )
    .fetch_one(&*pool)
    .await?;

    let running_count: i64 = row.get("running_count");
    let is_any_running = running_count > 0;

    if is_any_running {
      debug!("Found {} job(s) currently running", running_count);
    }

    Ok(is_any_running)
  }

  pub async fn mark_job_running(&self, job_name: &str, query_name: &str) -> Result<bool> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let mut tx = pool.begin().await?;
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
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
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
    .execute(&*pool)
    .await?;

    debug!(
      "Marked job '{}' query '{}' as not running",
      job_name, query_name
    );
    Ok(())
  }

  async fn get_next_queue_job(&self) -> Result<Option<PollingJob>> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let row = sqlx::query(
      r#"
      SELECT job_name, query_name
      FROM atomic_data_polling_state
      WHERE queue_completed_at IS NULL
      ORDER BY queue_position ASC
      LIMIT 1
      "#,
    )
    .fetch_optional(&*pool)
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
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
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
    .execute(&*pool)
    .await?;

    debug!(
      "Marked job '{}' query '{}' as completed in queue",
      job_name, query_name
    );
    Ok(())
  }

  async fn reset_job_queue(&self) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        queue_completed_at = NULL,
        updated_at = NOW()
      "#,
    )
    .execute(&*pool)
    .await?;

    info!("Reset job queue - all jobs marked as not completed for new cycle");
    Ok(())
  }

  pub async fn cleanup_stale_jobs(&self) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };

    // Adaptive stale job detection (backup safety net):
    // - If job is caught up (within 10% of max_block), use 10 min threshold (likely stuck)
    // - If job is doing initial backfill (far behind), use 30 min threshold (legitimately slow)
    // Note: Tokio + PostgreSQL statement_timeout is the primary defense; this cleanup handles
    // edge cases where both timeouts fail
    let short_threshold = Utc::now() - Duration::minutes(10);
    let long_threshold = Utc::now() - Duration::minutes(30);

    // Get all running jobs with their state
    let running_jobs = sqlx::query(
      r#"
      SELECT
        job_name,
        query_name,
        running_since,
        last_processed_block,
        last_max_block,
        CAST(EXTRACT(EPOCH FROM (NOW() - running_since))/60 AS DOUBLE PRECISION) as minutes_running
      FROM atomic_data_polling_state
      WHERE is_running = TRUE
      "#,
    )
    .fetch_all(&*pool)
    .await?;

    let mut jobs_to_cleanup = Vec::new();
    let mut caught_up_count = 0;
    let mut backfill_count = 0;

    for row in running_jobs {
      let job_name: String = row.get("job_name");
      let query_name: String = row.get("query_name");
      let running_since: Option<chrono::DateTime<Utc>> = row.get("running_since");
      let last_processed: Option<i64> = row.get("last_processed_block");
      let last_max: Option<i64> = row.get("last_max_block");
      let minutes_running: Option<f64> = row.get("minutes_running");

      // Check if job is caught up (within 10% or 1000 blocks of max)
      let is_caught_up = match (last_processed, last_max) {
        (Some(processed), Some(max)) if max > 0 => {
          let blocks_behind = max.saturating_sub(processed);
          let ten_percent = (max as f64 * 0.1) as i64;
          blocks_behind <= ten_percent.max(1000)
        }
        _ => false, // Can't determine, treat as backfilling (conservative)
      };

      // Determine if job is stale based on adaptive thresholds
      let is_stale = match running_since {
        None => true, // No running_since means it's in a bad state
        Some(since) => {
          if is_caught_up {
            // Caught up jobs: use 10 min threshold
            since < short_threshold
          } else {
            // Backfilling jobs: use 30 min threshold
            since < long_threshold
          }
        }
      };

      if is_stale {
        if is_caught_up {
          caught_up_count += 1;
        } else {
          backfill_count += 1;
        }

        let job_type = if is_caught_up { "caught up" } else { "backfilling" };
        warn!(
          "Marking job '{}' query '{}' for cleanup - {} but running for {:.1}min (last_processed: {:?}, last_max: {:?})",
          job_name, query_name, job_type, minutes_running.unwrap_or(0.0), last_processed, last_max
        );
        jobs_to_cleanup.push((job_name, query_name));
      }
    }

    // Clean up all stale jobs in one batch
    if !jobs_to_cleanup.is_empty() {
      for (job_name, query_name) in &jobs_to_cleanup {
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
        .execute(&*pool)
        .await?;
      }

      warn!(
        "Cleaned up {} stale job(s): {} caught-up (>10min), {} backfilling (>30min)",
        jobs_to_cleanup.len(), caught_up_count, backfill_count
      );
    }

    Ok(())
  }

  pub async fn finalize_job(&self, record: &ChangeRecord, failed_count: usize) -> Result<()> {
    if let Err(e) = self
      .mark_job_not_running(&record.job_name, &record.query_name)
      .await
    {
      warn!(
        "Failed to mark job '{}' as not running: {}",
        record.job_name, e
      );
    }

    // Only mark as completed if there were no publish failures
    // Publish failures are transient (network/infrastructure) and will retry
    if failed_count == 0 {
      if let Err(e) = self
        .mark_completed(&record.job_name, &record.query_name)
        .await
      {
        warn!(
          "Failed to mark job '{}' as completed: {}",
          record.job_name, e
        );
      } else {
        info!(
          "Job '{}' completed successfully and marked as done",
          record.job_name
        );
      }
    } else {
      warn!(
        "Job '{}' had {} publish errors (network/infrastructure) - will retry on next cycle",
        record.job_name, failed_count
      );
    }
    Ok(())
  }

  pub async fn cleanup_all_jobs(&self) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
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
    .execute(&*pool)
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

  /// Generate a unique hash for a record based on its identifying fields
  fn generate_record_hash(record: &ChangeRecord) -> String {
    use sha2::{Digest, Sha256};

    // Use pub_key and asset as the unique identifier if available
    let identifier = if let Some(pub_key) = record.atomic_data.get("pub_key") {
      if let Some(asset) = record.atomic_data.get("asset") {
        format!("{}:{}", pub_key, asset)
      } else {
        // Fallback to entire atomic_data if no asset
        serde_json::to_string(&record.atomic_data).unwrap_or_default()
      }
    } else {
      // Fallback to entire atomic_data
      serde_json::to_string(&record.atomic_data).unwrap_or_default()
    };

    let mut hasher = Sha256::new();
    hasher.update(identifier.as_bytes());
    format!("{:x}", hasher.finalize())
  }

  /// Mark a record as failed
  pub async fn mark_record_failed(
    &self,
    record: &ChangeRecord,
    error_type: &str,
    error_message: &str,
  ) -> Result<()> {
    let pool = {
      let pool_guard = self.pool.read().await;
      Arc::clone(&*pool_guard)
    };
    let record_hash = Self::generate_record_hash(record);

    // Use INSERT ... ON CONFLICT to update failure count if already exists
    sqlx::query(
      r#"
      INSERT INTO atomic_data_failed_records
        (job_name, query_name, record_hash, error_type, error_message, target_block, failure_count, atomic_data)
      VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
      ON CONFLICT (job_name, query_name, record_hash)
      DO UPDATE SET
        failure_count = atomic_data_failed_records.failure_count + 1,
        last_failed_at = NOW(),
        error_message = $5,
        target_block = $6
      "#,
    )
    .bind(&record.job_name)
    .bind(&record.query_name)
    .bind(&record_hash)
    .bind(error_type)
    .bind(error_message)
    .bind(record.target_block as i64)
    .bind(&record.atomic_data)
    .execute(&*pool)
    .await?;

    debug!(
      "Logged failed record for job '{}' (hash: {}, error: {})",
      record.job_name, &record_hash[..8], error_type
    );

    Ok(())
  }
}

