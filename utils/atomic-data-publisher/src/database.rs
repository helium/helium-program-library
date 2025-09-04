use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, Column, TypeInfo, postgres::PgPoolOptions, types::BigDecimal};

use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::config::{DatabaseConfig, WatchedTable};
use crate::errors::AtomicDataError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableValidationStatus {
  pub table_name: String,
  pub exists: bool,
  pub has_change_column: bool,
  pub query_valid: bool,
  pub validation_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
  pub table_name: String,
  pub primary_key: String,
  pub change_column_value: String,
  pub changed_at: DateTime<Utc>,
  pub atomic_data: serde_json::Value,
}

/// Tracks the last known state for polling (now stored in database)
#[derive(Debug, Clone)]
pub struct TablePollingState {
  pub table_name: String,
  pub query_name: String, // Add query identifier
  pub last_processed_block_height: i64,
  pub scan_cursor_block_height: i64,
  pub last_poll_time: DateTime<Utc>,
}

#[derive(Debug)]
pub struct DatabaseClient {
  pool: PgPool,
  watched_tables: Vec<WatchedTable>,
}

impl DatabaseClient {
  pub async fn new(config: &DatabaseConfig, watched_tables: Vec<WatchedTable>) -> Result<Self> {
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
      watched_tables,
    })
  }

    /// Initialize persistent polling state table and load/create state for each watched table
  pub async fn initialize_polling_state(&self) -> Result<()> {
    // Create the polling state table if it doesn't exist
    self.create_polling_state_table().await?;

    // Validate all watched tables exist and have required columns
    self.validate_watched_tables().await?;

    // Initialize state for each watched table
    for table in &self.watched_tables {
      self.initialize_table_polling_state(&table.name).await?;
    }

    info!("Initialized polling state for {} tables", self.watched_tables.len());
    Ok(())
  }

    /// Create the polling state table
  pub async fn create_polling_state_table(&self) -> Result<()> {
    // Create table with scan cursor for large table pagination and query-level tracking
    let create_table_query = r#"
      CREATE TABLE IF NOT EXISTS atomic_data_polling_state (
        table_name VARCHAR(255) NOT NULL,
        query_name VARCHAR(255) NOT NULL DEFAULT 'default',
        last_processed_block_height BIGINT NOT NULL DEFAULT 0,
        last_poll_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (table_name, query_name)
      )
    "#;

    sqlx::query(create_table_query).execute(&self.pool).await?;

    // Migrate existing single-key records to composite key format
    let migrate_existing_query = r#"
      INSERT INTO atomic_data_polling_state (table_name, query_name, last_processed_block_height, scan_cursor_block_height, last_poll_time, updated_at)
      SELECT table_name, 'default', last_processed_block_height, COALESCE(scan_cursor_block_height, 0), last_poll_time, updated_at
      FROM atomic_data_polling_state
      WHERE query_name IS NULL
      ON CONFLICT (table_name, query_name) DO NOTHING
    "#;

    // Try to run migration (will fail gracefully if column doesn't exist)
    let _ = sqlx::query(migrate_existing_query).execute(&self.pool).await;

    // Add query_name column if it doesn't exist (for existing databases)
    let add_query_column_query = r#"
      ALTER TABLE atomic_data_polling_state
      ADD COLUMN IF NOT EXISTS query_name VARCHAR(255) NOT NULL DEFAULT 'default'
    "#;

    sqlx::query(add_query_column_query).execute(&self.pool).await?;

    // Add scan_cursor_block_height column if it doesn't exist (for existing databases)
    let add_cursor_column_query = r#"
      ALTER TABLE atomic_data_polling_state
      ADD COLUMN IF NOT EXISTS scan_cursor_block_height BIGINT NOT NULL DEFAULT 0
    "#;

    sqlx::query(add_cursor_column_query).execute(&self.pool).await?;

    // Drop old single-column primary key and create composite key (if needed)
    let update_primary_key_query = r#"
      DO $$
      BEGIN
        -- Try to drop old constraint and create new one
        BEGIN
          ALTER TABLE atomic_data_polling_state DROP CONSTRAINT IF EXISTS atomic_data_polling_state_pkey;
          ALTER TABLE atomic_data_polling_state ADD PRIMARY KEY (table_name, query_name);
        EXCEPTION WHEN OTHERS THEN
          -- Primary key might already be correct, ignore errors
        END;
      END $$
    "#;

    sqlx::query(update_primary_key_query).execute(&self.pool).await?;

    // Create index
    let create_index_query = r#"
      CREATE INDEX IF NOT EXISTS idx_polling_state_updated_at
      ON atomic_data_polling_state (updated_at)
    "#;

    sqlx::query(create_index_query).execute(&self.pool).await?;

    info!("Created or verified atomic_data_polling_state table with query-level tracking support");
    Ok(())
  }

  /// Validate that all watched tables exist and have required columns
  async fn validate_watched_tables(&self) -> Result<()> {
    info!("Validating {} watched tables...", self.watched_tables.len());

    let mut missing_tables = Vec::new();
    let mut missing_columns = Vec::new();
    let mut validation_errors = Vec::new();

    for table in &self.watched_tables {
      // Check if table exists
      let table_exists = self.check_table_exists(&table.name).await?;

      if !table_exists {
        missing_tables.push(table.name.clone());
        error!("Watched table '{}' does not exist in database", table.name);
        continue;
      }

      // Check if required columns exist
      let table_columns = self.get_table_columns(&table.name).await?;

      // Validate change column (primary key 'address' is guaranteed to exist in hotspot tables)
      if !table_columns.contains(&table.change_column) {
        missing_columns.push(format!("{}:{}", table.name, table.change_column));
        error!(
          "Change column '{}' not found in table '{}'",
          table.change_column, table.name
        );
      }

      // Validate atomic data query syntax (basic check)
      if let Err(e) = self.validate_atomic_data_query(table).await {
        validation_errors.push(format!("Table '{}': {}", table.name, e));
        error!("Atomic data query validation failed for table '{}': {}", table.name, e);
      }

      info!("✓ Table '{}' validation passed", table.name);
    }

    // Report validation results
    if !missing_tables.is_empty() || !missing_columns.is_empty() || !validation_errors.is_empty() {
      error!("Database validation failed:");

      if !missing_tables.is_empty() {
        error!("Missing tables: {}", missing_tables.join(", "));
      }

      if !missing_columns.is_empty() {
        error!("Missing columns: {}", missing_columns.join(", "));
      }

      if !validation_errors.is_empty() {
        for error in &validation_errors {
          error!("Validation error: {}", error);
        }
      }

      return Err(anyhow::anyhow!(
        "Database validation failed: {} missing tables, {} missing columns, {} query errors",
        missing_tables.len(),
        missing_columns.len(),
        validation_errors.len()
      ));
    }

    info!("✅ All watched tables validated successfully");
    Ok(())
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

  /// Get all column names for a table
  async fn get_table_columns(&self, table_name: &str) -> Result<Vec<String>> {
    let query = r#"
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      ORDER BY ordinal_position;
    "#;

    let rows = sqlx::query(query)
      .bind(table_name)
      .fetch_all(&self.pool)
      .await?;

    let columns: Vec<String> = rows
      .iter()
      .map(|row| row.get::<String, _>("column_name"))
      .collect();

    Ok(columns)
  }

        /// Validate atomic data query syntax by doing a basic check
  async fn validate_atomic_data_query(&self, table: &WatchedTable) -> Result<()> {
    // First validate the query specification itself
    table.query_spec.validate_query()
      .map_err(|e| anyhow::anyhow!("Query specification error: {}", e))?;

    // Get the actual query
    let query_template = table.query_spec.get_query()
      .map_err(|e| anyhow::anyhow!("Failed to get query: {}", e))?;

    // For now, just do basic validation - check that it has required placeholders
    // Complex CTE queries are hard to validate without actual data
    if !query_template.contains("$PRIMARY_KEY") {
      return Err(anyhow::anyhow!("Query missing $PRIMARY_KEY placeholder"));
    }

    if !query_template.contains("$HOTSPOT_TYPE") {
      return Err(anyhow::anyhow!("Query missing $HOTSPOT_TYPE placeholder"));
    }

    debug!("Query validation passed for table '{}' (basic checks only)", table.name);
    Ok(())
  }

  /// Initialize polling state for a specific table and query combination
  pub async fn initialize_table_polling_state(&self, table_name: &str) -> Result<()> {
    // Find the WatchedTable config to get the query identifier
    let watched_table = self.watched_tables.iter()
      .find(|t| t.name == table_name)
      .ok_or_else(|| anyhow::anyhow!("No configuration found for table: {}", table_name))?;

    let query_identifier = watched_table.query_spec.get_query_identifier();

    // Check if state already exists for this table+query combination
    let existing_state = sqlx::query(
      r#"
      SELECT
        table_name,
        query_name,
        last_processed_block_height,
        COALESCE(scan_cursor_block_height, 0) as scan_cursor_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      WHERE table_name = $1 AND query_name = $2
      "#
    )
    .bind(table_name)
    .bind(&query_identifier)
    .fetch_optional(&self.pool)
    .await?;

        if let Some(row) = existing_state {
      let block_height: i64 = row.get("last_processed_block_height");
      info!(
        "Resuming polling for table '{}' query '{}' from block height {}",
        table_name, query_identifier, block_height
      );

      // If the block height is very high (like it was set to max during initialization)
      // and we want to reprocess existing records, reset it to 0
      if std::env::var("RESET_POLLING_STATE").is_ok() {
        debug!("RESET_POLLING_STATE environment variable detected - resetting polling state for table '{}' query '{}'", table_name, query_identifier);
        sqlx::query(
          r#"
          UPDATE atomic_data_polling_state
          SET
            last_processed_block_height = 0,
            scan_cursor_block_height = 0,
            updated_at = NOW()
          WHERE table_name = $1 AND query_name = $2
          "#
        )
        .bind(table_name)
        .bind(&query_identifier)
        .execute(&self.pool)
        .await?;
        debug!("Reset polling state for table '{}' query '{}' to start from block height 0", table_name, query_identifier);
      }

      return Ok(());
    }

    // No existing state - get current max change column value from the table
    // We already have the watched_table from above

    let query = format!(
      "SELECT COALESCE(MAX({}), 0) as max_value FROM {}",
      watched_table.change_column, table_name
    );

    let max_change_value: i64 = sqlx::query(&query)
      .fetch_one(&self.pool)
      .await?
      .try_get::<Option<BigDecimal>, _>("max_value")
      .unwrap_or(None)
      .map(|bd| bd.to_string().parse::<i64>().unwrap_or(0))
      .unwrap_or(0);

        // Insert initial state with scan cursor starting at 0
    // Set last_processed_block_height to 0 initially so we can process existing records
    sqlx::query(
      r#"
      INSERT INTO atomic_data_polling_state
      (table_name, query_name, last_processed_block_height, scan_cursor_block_height, last_poll_time, updated_at)
      VALUES ($1, $2, 0, 0, NOW(), NOW())
      "#
    )
    .bind(table_name)
    .bind(&query_identifier)
    .execute(&self.pool)
    .await?;

    info!(
      "Initialized polling state for table '{}' query '{}': starting from last_processed_block_height = 0 (will process existing records with max {} = {})",
      table_name, query_identifier, watched_table.change_column, max_change_value
    );

    Ok(())
  }

  /// Get the current scan cursor for a table and query (for large table pagination)
  async fn get_table_scan_cursor(&self, table: &WatchedTable) -> Result<i64> {
    let query_identifier = table.query_spec.get_query_identifier();

    let row = sqlx::query(
      r#"
      SELECT scan_cursor_block_height
      FROM atomic_data_polling_state
      WHERE table_name = $1 AND query_name = $2
      "#
    )
    .bind(&table.name)
    .bind(&query_identifier)
    .fetch_one(&self.pool)
    .await?;

    Ok(row.get("scan_cursor_block_height"))
  }

  /// Update the scan cursor after processing a batch of rows
  async fn update_table_scan_cursor(&self, table: &WatchedTable, new_cursor: i64) -> Result<()> {
    let query_identifier = table.query_spec.get_query_identifier();

    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        scan_cursor_block_height = $1,
        updated_at = NOW()
      WHERE table_name = $2 AND query_name = $3
      "#
    )
    .bind(new_cursor)
    .bind(&table.name)
    .bind(&query_identifier)
    .execute(&self.pool)
    .await?;

    debug!("Updated scan cursor for table '{}' query '{}' to {}", table.name, query_identifier, new_cursor);
    Ok(())
  }

  /// Reset scan cursor to 0 when we've completed a full table scan
  async fn reset_table_scan_cursor(&self, table: &WatchedTable) -> Result<()> {
    let query_identifier = table.query_spec.get_query_identifier();

    sqlx::query(
      r#"
      UPDATE atomic_data_polling_state
      SET
        scan_cursor_block_height = 0,
        updated_at = NOW()
      WHERE table_name = $1 AND query_name = $2
      "#
    )
    .bind(&table.name)
    .bind(&query_identifier)
    .execute(&self.pool)
    .await?;

    info!("Reset scan cursor for table '{}' query '{}' - starting new full table scan", table.name, query_identifier);
    Ok(())
  }

  /// Get ALL pending changes from all watched tables using direct polling
  pub async fn get_all_pending_changes(&self) -> Result<Vec<ChangeRecord>> {
    let mut all_changes = Vec::new();

    for table in &self.watched_tables {
      // Query ALL pending changes, not limited by batch_size
      let changes = self.poll_table_changes(table).await?;
      all_changes.extend(changes);
    }

    // Sort by block height and then by primary key for deterministic processing order
    all_changes.sort_by(|a, b| {
      let a_height = a.change_column_value.parse::<i64>().unwrap_or(0);
      let b_height = b.change_column_value.parse::<i64>().unwrap_or(0);
      a_height.cmp(&b_height).then_with(|| a.primary_key.cmp(&b.primary_key))
    });

    info!(
      "Found {} total pending changes across all tables via polling",
      all_changes.len()
    );
    Ok(all_changes)
  }

  /// Poll for changes in a specific table using persistent state
  /// Now runs atomic query on ALL rows and filters by block height criteria
  async fn poll_table_changes(&self, table: &WatchedTable) -> Result<Vec<ChangeRecord>> {
    let query_identifier = table.query_spec.get_query_identifier();

    // Get current polling state from database
    let current_state_row = sqlx::query(
      r#"
      SELECT
        table_name,
        query_name,
        last_processed_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      WHERE table_name = $1 AND query_name = $2
      "#
    )
    .bind(&table.name)
    .bind(&query_identifier)
    .fetch_one(&self.pool)
    .await?;

    let current_block_height: i64 = current_state_row.get("last_processed_block_height");

    // Get all records from the table (with a reasonable limit)
    let query = format!(
      r#"
      SELECT address, {}, refreshed_at
      FROM {}
      ORDER BY address ASC
      LIMIT $1
      "#,
      table.change_column, table.name
    );
    let all_rows = sqlx::query(&query)
      .bind(100000i64) // Large limit to get all pending records
      .fetch_all(&self.pool)
      .await?;

    let mut changes = Vec::new();
    let mut processed_count = 0;

    debug!(
      "Processing {} total rows from table '{}' (current block height: {})",
      all_rows.len(), table.name, current_block_height
    );

    // If we got fewer rows than requested, we may have reached the end of the table
    let reached_end_of_table = all_rows.len() < 100000;

    for row in all_rows {
      let primary_key: String = row.get("address");
      let base_change_value: i64 = row.try_get::<BigDecimal, _>(table.change_column.as_str())
        .map(|bd| bd.to_string().parse::<i64>().unwrap_or(0))
        .unwrap_or(0);
      let changed_at: DateTime<Utc> = row.try_get("refreshed_at").unwrap_or_else(|_| Utc::now());

      // Execute the atomic data query on EVERY row
      let atomic_data = match self.execute_atomic_data_query(table, &primary_key).await {
        Ok(data) => data,
        Err(e) => {
          warn!("Failed to execute atomic query for {}/{}: {}", table.name, primary_key, e);
          continue; // Skip this row but continue processing others
        }
      };

            // Extract the max_block_height from the atomic query result
      let effective_block_height = if let Some(first_row) = atomic_data.as_array().and_then(|arr| arr.first()) {
        if let Some(max_block_height_value) = first_row.get("max_block_height") {
          // Use the max block height from all joined tables
          let extracted_height = match max_block_height_value {
            serde_json::Value::Number(n) => n.as_i64().unwrap_or(base_change_value),
            serde_json::Value::String(s) => s.parse::<i64>().unwrap_or(base_change_value),
            _ => {
              warn!("Unexpected max_block_height format: {:?}", max_block_height_value);
              base_change_value
            }
          };
          debug!(
            "Address {}: base_change_value={}, extracted max_block_height={} (from {:?}), current_block_height={}",
            primary_key, base_change_value, extracted_height, max_block_height_value, current_block_height
          );
          extracted_height
        } else {
          // Fallback to the base table's change value
          debug!("Address {}: No max_block_height found in atomic query result, using base_change_value={}", primary_key, base_change_value);
          base_change_value
        }
      } else {
        debug!("Address {}: No atomic query result, using base_change_value={}", primary_key, base_change_value);
        base_change_value
      };

      // Include records with effective block height > current processed height
      let should_include = effective_block_height > current_block_height;

      debug!(
        "Address {}: effective_block_height = {}, current_block_height = {}, include = {}",
        primary_key, effective_block_height, current_block_height, should_include
      );

      if should_include {
        changes.push(ChangeRecord {
          table_name: table.name.clone(),
          primary_key: primary_key.clone(),
          change_column_value: effective_block_height.to_string(),
          changed_at,
          atomic_data,
        });
      }

      processed_count += 1;
    }

    // Note: Polling state will be updated after successful publishing in the service layer
    // This ensures we only mark records as processed after they've been successfully published

    // Sort changes by block height and then by primary key for deterministic processing
    changes.sort_by(|a, b| {
      let a_height = a.change_column_value.parse::<i64>().unwrap_or(0);
      let b_height = b.change_column_value.parse::<i64>().unwrap_or(0);
      match a_height.cmp(&b_height) {
        std::cmp::Ordering::Equal => a.primary_key.cmp(&b.primary_key),
        other => other,
      }
    });

    info!(
      "Polled table '{}': processed {} rows, found {} changes meeting criteria (block height > {}), reached_end: {}",
      table.name, processed_count, changes.len(), current_block_height, reached_end_of_table
    );

    Ok(changes)
  }

  /// Execute the atomic data construction query with hotspot type parameter
  async fn execute_atomic_data_query(
    &self,
    table: &WatchedTable,
    primary_key: &str,
  ) -> Result<serde_json::Value> {
    debug!(
      "Executing atomic data query for table: {}, primary_key: {}, hotspot_type: {:?}",
      table.name, primary_key, table.hotspot_type
    );

    // Get the query from the query specification
    let query_template = table.query_spec.get_query()
      .map_err(|e| anyhow::anyhow!("Failed to get query for table '{}': {}", table.name, e))?;

    // All queries now use the unified format with hotspot type parameter
    let hotspot_type_str = match table.hotspot_type {
      crate::config::HotspotType::Mobile => "mobile",
      crate::config::HotspotType::Iot => "iot",
    };

    let processed_query = query_template
      .replace("$PRIMARY_KEY", "$1")
      .replace("$HOTSPOT_TYPE", "$2");
    let query = processed_query.trim_end_matches(';'); // Remove trailing semicolon if present

    let rows = sqlx::query(&query)
      .bind(primary_key)
      .bind(hotspot_type_str)
      .fetch_all(&self.pool)
      .await
    .map_err(|e| {
      error!(
        "Failed to execute atomic data query for {}: {}",
        table.name, e
      );
      AtomicDataError::DatabaseError(e.to_string())
    })?;

    debug!("Query returned {} rows for key {} type {}", rows.len(), primary_key, hotspot_type_str);

    // Convert rows to JSON
    let mut result = Vec::new();
    for row in rows {
      let mut row_data = serde_json::Map::new();

      for (i, column) in row.columns().iter().enumerate() {
        let column_name = column.name();

        // Handle different PostgreSQL types
        let value = match column.type_info().name() {
          "TEXT" | "VARCHAR" => {
            let val: Option<String> = row.try_get(i).unwrap_or(None);
            val
              .map(serde_json::Value::String)
              .unwrap_or(serde_json::Value::Null)
          }
          "INT4" | "INTEGER" => {
            let val: Option<i32> = row.try_get(i).unwrap_or(None);
            val
              .map(|v| serde_json::Value::Number(v.into()))
              .unwrap_or(serde_json::Value::Null)
          }
          "INT8" | "BIGINT" => {
            let val: Option<i64> = row.try_get(i).unwrap_or(None);
            val
              .map(|v| serde_json::Value::Number(v.into()))
              .unwrap_or(serde_json::Value::Null)
          }
          "BOOL" | "BOOLEAN" => {
            let val: Option<bool> = row.try_get(i).unwrap_or(None);
            val
              .map(serde_json::Value::Bool)
              .unwrap_or(serde_json::Value::Null)
          }
          "TIMESTAMPTZ" | "TIMESTAMP" => {
            let val: Option<DateTime<Utc>> = row.try_get(i).unwrap_or(None);
            val
              .map(|v| serde_json::Value::String(v.to_rfc3339()))
              .unwrap_or(serde_json::Value::Null)
          }
          "UUID" => {
            let val: Option<Uuid> = row.try_get(i).unwrap_or(None);
            val
              .map(|v| serde_json::Value::String(v.to_string()))
              .unwrap_or(serde_json::Value::Null)
          }
          "JSONB" | "JSON" => {
            let val: Option<serde_json::Value> = row.try_get(i).unwrap_or(None);
            val.unwrap_or(serde_json::Value::Null)
          }
          "NUMERIC" => {
            let val: Option<BigDecimal> = row.try_get(i).unwrap_or(None);
            val
              .map(|v| serde_json::Value::String(v.to_string()))
              .unwrap_or(serde_json::Value::Null)
          }
          _ => {
            // Fallback to string representation
            warn!(
              "Unhandled column type: {} for column: {}",
              column.type_info().name(),
              column_name
            );
            let val: Option<String> = row.try_get(i).unwrap_or(None);
            val
              .map(serde_json::Value::String)
              .unwrap_or(serde_json::Value::Null)
          }
        };

        row_data.insert(column_name.to_string(), value);
      }

      result.push(serde_json::Value::Object(row_data));
    }

    debug!("Final JSON result: {}", serde_json::Value::Array(result.clone()));
    Ok(serde_json::Value::Array(result))
  }

  /// Mark changes as processed by updating the polling state
  /// Updates last_processed_block_height to track progress
  pub async fn mark_changes_processed(&self, changes: &[ChangeRecord]) -> Result<()> {
    if changes.is_empty() {
      return Ok(());
    }

    // Group changes by table and track the highest block height processed in each table
    let mut table_max_heights = std::collections::HashMap::new();

    for change in changes {
      let block_height = change.change_column_value.parse::<i64>()
        .unwrap_or(0);

      // Keep track of the highest block height for each table
      let current_max = table_max_heights.get(&change.table_name).unwrap_or(&0);
      if block_height > *current_max {
        table_max_heights.insert(change.table_name.clone(), block_height);
      }
    }

    // Update polling state for each table
    for (table_name, last_block_height) in table_max_heights {
      // Find the table configuration to get the query identifier
      let watched_table = self.watched_tables.iter()
        .find(|t| t.name == table_name)
        .ok_or_else(|| anyhow::anyhow!("No configuration found for table: {}", table_name))?;

      let query_identifier = watched_table.query_spec.get_query_identifier();

      // Update only the block height
      sqlx::query(
        r#"
        UPDATE atomic_data_polling_state
        SET
          last_processed_block_height = $1,
          last_poll_time = NOW(),
          updated_at = NOW()
        WHERE table_name = $2 AND query_name = $3
        "#
      )
      .bind(last_block_height)
      .bind(&table_name)
      .bind(&query_identifier)
      .execute(&self.pool)
      .await?;

      debug!(
        "Updated polling state for table '{}' query '{}': last_processed_block_height -> {}",
        table_name, query_identifier, last_block_height
      );
    }

    debug!("Marked {} changes as processed", changes.len());
    Ok(())
  }

  /// Health check - verify database connectivity
  pub async fn health_check(&self) -> Result<()> {
    sqlx::query("SELECT 1").execute(&self.pool).await?;
    Ok(())
  }

  /// Clean up old processed changes (no-op for polling approach)
  pub async fn cleanup_old_changes(&self, _older_than_days: u32) -> Result<()> {
    // With polling approach, we don't have tracking tables to clean up
    // State is maintained in memory and resets on service restart
    debug!("Cleanup called - no tracking tables to clean with polling approach");
    Ok(())
  }

    /// Get current polling state for all tables (useful for debugging)
  pub async fn get_polling_state(&self) -> Result<Vec<TablePollingState>> {
    let rows = sqlx::query(
      r#"
      SELECT
        table_name,
        query_name,
        last_processed_block_height,
        scan_cursor_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      ORDER BY table_name, query_name
      "#
    )
    .fetch_all(&self.pool)
    .await?;

    let mut states = Vec::new();
    for row in rows {
      states.push(TablePollingState {
        table_name: row.get("table_name"),
        query_name: row.get("query_name"),
        last_processed_block_height: row.get("last_processed_block_height"),
        scan_cursor_block_height: row.get("scan_cursor_block_height"),
        last_poll_time: row.get("last_poll_time"),
      });
    }

    Ok(states)
  }

  /// Get validation status for all watched tables (useful for monitoring/debugging)
  pub async fn get_table_validation_status(&self) -> Vec<TableValidationStatus> {
    let mut validation_statuses = Vec::new();

    for table in &self.watched_tables {
      let mut status = TableValidationStatus {
        table_name: table.name.clone(),
        exists: false,
        has_change_column: false,
        query_valid: false,
        validation_errors: Vec::new(),
      };

      // Check if table exists
      match self.check_table_exists(&table.name).await {
        Ok(exists) => {
          status.exists = exists;
          if !exists {
            status.validation_errors.push("Table does not exist".to_string());
          }
        }
        Err(e) => {
          status.validation_errors.push(format!("Failed to check table existence: {}", e));
        }
      }

      if status.exists {
        // Check columns (primary key 'address' is guaranteed to exist in hotspot tables)
        match self.get_table_columns(&table.name).await {
          Ok(columns) => {
            status.has_change_column = columns.contains(&table.change_column);

            if !status.has_change_column {
              status.validation_errors.push(format!(
                "Change column '{}' not found",
                table.change_column
              ));
            }
          }
          Err(e) => {
            status.validation_errors.push(format!("Failed to get table columns: {}", e));
          }
        }

        // Check query validity
        match self.validate_atomic_data_query(table).await {
          Ok(_) => status.query_valid = true,
          Err(e) => {
            status.validation_errors.push(format!("Query validation failed: {}", e));
          }
        }
      }

      validation_statuses.push(status);
    }

    validation_statuses
  }

  /// Validate tables with option for graceful degradation
  pub async fn validate_watched_tables_with_options(&self, fail_fast: bool) -> Result<Vec<String>> {
    info!("Validating {} watched tables (fail_fast: {})...", self.watched_tables.len(), fail_fast);

    let validation_statuses = self.get_table_validation_status().await;
    let mut valid_tables = Vec::new();
    let mut has_errors = false;

    for status in &validation_statuses {
      let is_valid = status.exists
        && status.has_change_column
        && status.query_valid;

      if is_valid {
        valid_tables.push(status.table_name.clone());
        info!("✓ Table '{}' validation passed", status.table_name);
      } else {
        has_errors = true;
        error!("✗ Table '{}' validation failed:", status.table_name);
        for error in &status.validation_errors {
          error!("  - {}", error);
        }

        if fail_fast {
          return Err(anyhow::anyhow!(
            "Table validation failed for '{}': {}",
            status.table_name,
            status.validation_errors.join(", ")
          ));
        }
      }
    }

    if has_errors {
      if valid_tables.is_empty() {
        error!("❌ No valid tables found - service cannot operate");
        return Err(anyhow::anyhow!("No valid tables found for monitoring"));
      } else {
        warn!(
          "⚠️  Some tables failed validation - continuing with {} valid tables: {}",
          valid_tables.len(),
          valid_tables.join(", ")
        );
      }
    } else {
      info!("✅ All {} watched tables validated successfully", self.watched_tables.len());
    }

    Ok(valid_tables)
  }
}
