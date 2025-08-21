use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use std::collections::HashMap;
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

#[derive(Debug, Clone)]
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

  /// Initialize tracking tables for change detection
  pub async fn initialize_tracking(&self) -> Result<()> {
    for table in &self.watched_tables {
      self.create_tracking_table(&table.name).await?;
      self
        .create_change_trigger(&table.name, &table.change_column)
        .await?;
    }
    Ok(())
  }

  /// Create a tracking table for change detection
  async fn create_tracking_table(&self, table_name: &str) -> Result<()> {
    let tracking_table = format!("{}_changes", table_name);

    let create_query = format!(
      r#"
            CREATE TABLE IF NOT EXISTS {} (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                table_name VARCHAR NOT NULL,
                primary_key VARCHAR NOT NULL,
                change_column_value TEXT NOT NULL,
                changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                processed BOOLEAN DEFAULT FALSE,
                processed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_{}_processed
            ON {} (processed, changed_at);

            CREATE INDEX IF NOT EXISTS idx_{}_primary_key
            ON {} (primary_key);
            "#,
      tracking_table, tracking_table, tracking_table, tracking_table, tracking_table
    );

    sqlx::query(&create_query).execute(&self.pool).await?;

    info!("Created tracking table: {}", tracking_table);
    Ok(())
  }

  /// Create a trigger to detect changes in the watched column
  async fn create_change_trigger(&self, table_name: &str, change_column: &str) -> Result<()> {
    let tracking_table = format!("{}_changes", table_name);
    let trigger_function = format!("{}_change_trigger", table_name);
    let trigger_name = format!("{}_change_notify", table_name);

    // Create trigger function
    let function_query = format!(
      r#"
            CREATE OR REPLACE FUNCTION {}()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Only insert if the change column actually changed
                IF OLD.{} IS DISTINCT FROM NEW.{} THEN
                    INSERT INTO {} (table_name, primary_key, change_column_value)
                    VALUES ('{}', NEW.id::TEXT, NEW.{}::TEXT);
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            "#,
      trigger_function, change_column, change_column, tracking_table, table_name, change_column
    );

    sqlx::query(&function_query).execute(&self.pool).await?;

    // Create trigger
    let trigger_query = format!(
      r#"
            DROP TRIGGER IF EXISTS {} ON {};
            CREATE TRIGGER {}
                AFTER UPDATE ON {}
                FOR EACH ROW
                EXECUTE FUNCTION {}();
            "#,
      trigger_name, table_name, trigger_name, table_name, trigger_function
    );

    sqlx::query(&trigger_query).execute(&self.pool).await?;

    info!(
      "Created change trigger for table: {} on column: {}",
      table_name, change_column
    );
    Ok(())
  }

  /// Get pending changes from all watched tables
  pub async fn get_pending_changes(&self, limit: u32) -> Result<Vec<ChangeRecord>> {
    let mut all_changes = Vec::new();

    for table in &self.watched_tables {
      let changes = self.get_table_changes(table, limit).await?;
      all_changes.extend(changes);
    }

    // Sort by changed_at to process in chronological order
    all_changes.sort_by(|a, b| a.changed_at.cmp(&b.changed_at));

    // Limit the total results
    all_changes.truncate(limit as usize);

    debug!(
      "Found {} pending changes across all tables",
      all_changes.len()
    );
    Ok(all_changes)
  }

  /// Get pending changes for a specific table
  async fn get_table_changes(&self, table: &WatchedTable, limit: u32) -> Result<Vec<ChangeRecord>> {
    let tracking_table = format!("{}_changes", table.name);

    let query = format!(
      r#"
            SELECT id, table_name, primary_key, change_column_value, changed_at
            FROM {}
            WHERE processed = FALSE
            ORDER BY changed_at ASC
            LIMIT $1
            "#,
      tracking_table
    );

    let rows = sqlx::query(&query)
      .bind(limit as i64)
      .fetch_all(&self.pool)
      .await?;

    let mut changes = Vec::new();

    for row in rows {
      let primary_key: String = row.get("primary_key");
      let change_column_value: String = row.get("change_column_value");
      let changed_at: DateTime<Utc> = row.get("changed_at");

      // Execute the atomic data query
      let atomic_data = self.execute_atomic_data_query(table, &primary_key).await?;

      changes.push(ChangeRecord {
        table_name: table.name.clone(),
        primary_key,
        change_column_value,
        changed_at,
        atomic_data,
      });
    }

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

  /// Mark changes as processed
  pub async fn mark_changes_processed(&self, changes: &[ChangeRecord]) -> Result<()> {
    for table in &self.watched_tables {
      let table_changes: Vec<_> = changes
        .iter()
        .filter(|c| c.table_name == table.name)
        .collect();

      if table_changes.is_empty() {
        continue;
      }

      let tracking_table = format!("{}_changes", table.name);
      let primary_keys: Vec<&String> = table_changes.iter().map(|c| &c.primary_key).collect();

      let query = format!(
        r#"
                UPDATE {}
                SET processed = TRUE, processed_at = NOW()
                WHERE table_name = $1 AND primary_key = ANY($2) AND processed = FALSE
                "#,
        tracking_table
      );

      let affected = sqlx::query(&query)
        .bind(&table.name)
        .bind(&primary_keys)
        .execute(&self.pool)
        .await?
        .rows_affected();

      debug!(
        "Marked {} changes as processed for table: {}",
        affected, table.name
      );
    }

    Ok(())
  }

  /// Health check - verify database connectivity
  pub async fn health_check(&self) -> Result<()> {
    sqlx::query("SELECT 1").execute(&self.pool).await?;
    Ok(())
  }

  /// Clean up old processed changes (for maintenance)
  pub async fn cleanup_old_changes(&self, older_than_days: u32) -> Result<()> {
    for table in &self.watched_tables {
      let tracking_table = format!("{}_changes", table.name);

      let query = format!(
        r#"
                DELETE FROM {}
                WHERE processed = TRUE
                AND processed_at < NOW() - INTERVAL '{} days'
                "#,
        tracking_table, older_than_days
      );

      let affected = sqlx::query(&query)
        .execute(&self.pool)
        .await?
        .rows_affected();

      if affected > 0 {
        info!(
          "Cleaned up {} old processed changes from table: {}",
          affected, tracking_table
        );
      }
    }

    Ok(())
  }
}
