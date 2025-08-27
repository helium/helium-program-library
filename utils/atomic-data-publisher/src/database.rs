use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, Column, TypeInfo, postgres::PgPoolOptions};

use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::config::{DatabaseConfig, WatchedTable};
use crate::errors::AtomicDataError;

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
  pub last_processed_block_height: i64,
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

    // Initialize state for each watched table
    for table in &self.watched_tables {
      self.initialize_table_polling_state(&table.name).await?;
    }

    info!("Initialized polling state for {} tables", self.watched_tables.len());
    Ok(())
  }

  /// Create the polling state table
  async fn create_polling_state_table(&self) -> Result<()> {
    let create_query = r#"
      CREATE TABLE IF NOT EXISTS atomic_data_polling_state (
        table_name VARCHAR(255) PRIMARY KEY,
        last_processed_block_height BIGINT NOT NULL DEFAULT 0,
        last_poll_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_polling_state_updated_at
      ON atomic_data_polling_state (updated_at);
    "#;

    sqlx::query(create_query).execute(&self.pool).await?;
    info!("Created or verified atomic_data_polling_state table");
    Ok(())
  }

  /// Initialize polling state for a specific table
  async fn initialize_table_polling_state(&self, table_name: &str) -> Result<()> {
        // Check if state already exists
    let existing_state = sqlx::query(
      r#"
      SELECT
        table_name,
        last_processed_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      WHERE table_name = $1
      "#
    )
    .bind(table_name)
    .fetch_optional(&self.pool)
    .await?;

    if let Some(row) = existing_state {
      let block_height: i64 = row.get("last_processed_block_height");
      info!(
        "Resuming polling for table '{}' from block height {}",
        table_name, block_height
      );
      return Ok(());
    }

    // No existing state - get current max change column value from the table
    // Find the WatchedTable config to get the change_column
    let watched_table = self.watched_tables.iter()
      .find(|t| t.name == table_name)
      .ok_or_else(|| anyhow::anyhow!("No configuration found for table: {}", table_name))?;

    let query = format!(
      "SELECT COALESCE(MAX({}), 0) as max_value FROM {}",
      watched_table.change_column, table_name
    );

    let max_change_value: i64 = sqlx::query(&query)
      .fetch_one(&self.pool)
      .await?
      .try_get("max_value")
      .unwrap_or(0);

        // Insert initial state
    sqlx::query(
      r#"
      INSERT INTO atomic_data_polling_state
      (table_name, last_processed_block_height, last_poll_time, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      "#
    )
    .bind(table_name)
    .bind(max_change_value)
    .execute(&self.pool)
    .await?;

    info!(
      "Initialized polling state for table '{}': starting from {} = {}",
      table_name, watched_table.change_column, max_change_value
    );

    Ok(())
  }



  /// Get pending changes from all watched tables using direct polling
  pub async fn get_pending_changes(&self, limit: u32) -> Result<Vec<ChangeRecord>> {
    let mut all_changes = Vec::new();

    for table in &self.watched_tables {
      let changes = self.poll_table_changes(table, limit).await?;
      all_changes.extend(changes);
    }

    // Sort by changed_at to process in chronological order
    all_changes.sort_by(|a, b| a.changed_at.cmp(&b.changed_at));

    // Limit the total results
    all_changes.truncate(limit as usize);

    debug!(
      "Found {} pending changes across all tables via polling",
      all_changes.len()
    );
    Ok(all_changes)
  }

  /// Poll for changes in a specific table using persistent state
  async fn poll_table_changes(&self, table: &WatchedTable, limit: u32) -> Result<Vec<ChangeRecord>> {
        // Get current polling state from database
    let current_state_row = sqlx::query(
      r#"
      SELECT
        table_name,
        last_processed_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      WHERE table_name = $1
      "#
    )
    .bind(&table.name)
    .fetch_one(&self.pool)
    .await?;

    let current_block_height: i64 = current_state_row.get("last_processed_block_height");

    // Query for records with change column greater than last processed
    let query = format!(
      r#"
      SELECT {}, {}, updated_at
      FROM {}
      WHERE {} > $1
      ORDER BY {} ASC
      LIMIT $2
      "#,
      table.primary_key_column, table.change_column, table.name,
      table.change_column, table.change_column
    );

    let rows = sqlx::query(&query)
      .bind(current_block_height)
      .bind(limit as i64)
      .fetch_all(&self.pool)
      .await?;

    let mut changes = Vec::new();
    let mut max_block_height = current_block_height;

    for row in rows {
      let primary_key: String = row.get(table.primary_key_column.as_str());
      let change_value: i64 = row.get(table.change_column.as_str());
      let changed_at: DateTime<Utc> = row.try_get("updated_at").unwrap_or_else(|_| Utc::now());

      // Track the maximum change value
      max_block_height = max_block_height.max(change_value);

      // Execute the atomic data query
      let atomic_data = self.execute_atomic_data_query(table, &primary_key).await?;

      changes.push(ChangeRecord {
        table_name: table.name.clone(),
        primary_key,
        change_column_value: change_value.to_string(),
        changed_at,
        atomic_data,
      });
    }

        // Update polling state with the latest block height (only if we found changes)
    if !changes.is_empty() && max_block_height > current_block_height {
      sqlx::query(
        r#"
        UPDATE atomic_data_polling_state
        SET
          last_processed_block_height = $1,
          last_poll_time = NOW(),
          updated_at = NOW()
        WHERE table_name = $2
        "#
      )
      .bind(max_block_height)
      .bind(&table.name)
      .execute(&self.pool)
      .await?;

      debug!(
        "Updated polling state for table '{}': {} {} -> {}",
        table.name, table.change_column, current_block_height, max_block_height
      );
    }

    debug!(
      "Polled table '{}': found {} changes ({} > {})",
      table.name, changes.len(), table.change_column, current_block_height
    );

    Ok(changes)
  }

  /// Execute the atomic data construction query
  async fn execute_atomic_data_query(
    &self,
    table: &WatchedTable,
    primary_key: &str,
  ) -> Result<serde_json::Value> {
    debug!(
      "Executing atomic data query for table: {}, primary_key: {}",
      table.name, primary_key
    );

    // Replace placeholder in query with actual primary key
    let query = table.atomic_data_query.replace("$PRIMARY_KEY", primary_key);

    let rows = sqlx::query(&query)
      .fetch_all(&self.pool)
      .await
      .map_err(|e| {
        error!(
          "Failed to execute atomic data query for {}: {}",
          table.name, e
        );
        AtomicDataError::DatabaseError(e.to_string())
      })?;

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

    Ok(serde_json::Value::Array(result))
  }

  /// Mark changes as processed (no-op for polling approach, state is already updated)
  pub async fn mark_changes_processed(&self, changes: &[ChangeRecord]) -> Result<()> {
    // With polling approach, we already updated the state when we fetched the changes
    // This method is kept for compatibility but doesn't need to do anything
    debug!("Marked {} changes as processed (polling approach)", changes.len());
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
        last_processed_block_height,
        last_poll_time
      FROM atomic_data_polling_state
      ORDER BY table_name
      "#
    )
    .fetch_all(&self.pool)
    .await?;

    let mut states = Vec::new();
    for row in rows {
      states.push(TablePollingState {
        table_name: row.get("table_name"),
        last_processed_block_height: row.get("last_processed_block_height"),
        last_poll_time: row.get("last_poll_time"),
      });
    }

    Ok(states)
  }
}
