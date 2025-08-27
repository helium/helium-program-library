use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize, Clone)]
pub struct Settings {
  pub database: DatabaseConfig,
  pub ingestor: IngestorConfig,
  pub service: ServiceConfig,
  pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
  pub host: String,
  pub port: u16,
  pub username: String,
  pub password: String,
  pub database_name: String,
  pub max_connections: u32,
  pub min_connections: u32,
  pub acquire_timeout_seconds: u64,
  pub idle_timeout_seconds: u64,
  pub max_lifetime_seconds: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct IngestorConfig {
  pub grpc_endpoint: String,
  pub timeout_seconds: u64,
  pub max_retries: u32,
  pub retry_delay_seconds: u64,
  pub tls_enabled: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServiceConfig {
  pub polling_interval_seconds: u64,
  pub batch_size: u32,
  pub max_concurrent_publishes: u32,
  pub health_check_port: u16,
  pub watched_tables: Vec<WatchedTable>,
  #[serde(default = "default_fail_on_missing_tables")]
  pub fail_on_missing_tables: bool,
  #[serde(default = "default_validation_retry_attempts")]
  pub validation_retry_attempts: u32,
  #[serde(default = "default_validation_retry_delay_seconds")]
  pub validation_retry_delay_seconds: u64,
}

fn default_fail_on_missing_tables() -> bool {
  true
}

fn default_validation_retry_attempts() -> u32 {
  3
}

fn default_validation_retry_delay_seconds() -> u64 {
  30
}

#[derive(Debug, Deserialize, Clone)]
pub struct WatchedTable {
  pub name: String,
  pub change_column: String, // The column to monitor for changes (e.g., "last_block_height")
  pub primary_key_column: String, // The primary key column (e.g., "id", "address", "pubkey")

  // Query specification - can be either a named query or inline SQL
  #[serde(flatten)]
  pub query_spec: QuerySpec,

  pub hotspot_type: HotspotType,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum QuerySpec {
  /// Reference to a named query from the queries module
  Named { query_name: String },
  /// Inline SQL query (for custom queries)
  Inline { atomic_data_query: String },
}

impl QuerySpec {
  /// Get the actual SQL query string
  pub fn get_query(&self) -> Result<String, String> {
    match self {
      QuerySpec::Named { query_name } => {
        crate::queries::AtomicHotspotQueries::get_query(query_name)
          .map(|q| q.to_string())
          .ok_or_else(|| format!("Unknown query name: {}", query_name))
      }
      QuerySpec::Inline { atomic_data_query } => Ok(atomic_data_query.clone()),
    }
  }

  /// Check if query contains required placeholder
  pub fn validate_query(&self) -> Result<(), String> {
    let query = self.get_query()?;

    if !query.contains("$PRIMARY_KEY") {
      return Err("Query must contain $PRIMARY_KEY placeholder".to_string());
    }

    Ok(())
  }
}

#[derive(Debug, Deserialize, Clone)]
pub enum HotspotType {
  #[serde(rename = "mobile")]
  Mobile,
  #[serde(rename = "iot")]
  Iot,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
  pub level: String,
  pub format: String,
}

impl Settings {
  pub fn new() -> Result<Self, ConfigError> {
    let s = Config::builder()
      .add_source(File::with_name("config/default").required(false))
      .add_source(File::with_name("config/local").required(false))
      .add_source(Environment::with_prefix("ATOMIC_DATA_PUBLISHER"))
      .build()?;

    s.try_deserialize()
  }

  pub fn database_url(&self) -> String {
    format!(
      "postgres://{}:{}@{}:{}/{}",
      self.database.username,
      self.database.password,
      self.database.host,
      self.database.port,
      self.database.database_name
    )
  }

  pub fn polling_interval(&self) -> Duration {
    Duration::from_secs(self.service.polling_interval_seconds)
  }

  pub fn ingestor_timeout(&self) -> Duration {
    Duration::from_secs(self.ingestor.timeout_seconds)
  }

  pub fn retry_delay(&self) -> Duration {
    Duration::from_secs(self.ingestor.retry_delay_seconds)
  }

  pub fn database_acquire_timeout(&self) -> Duration {
    Duration::from_secs(self.database.acquire_timeout_seconds)
  }

  pub fn database_idle_timeout(&self) -> Duration {
    Duration::from_secs(self.database.idle_timeout_seconds)
  }

  pub fn database_max_lifetime(&self) -> Duration {
    Duration::from_secs(self.database.max_lifetime_seconds)
  }
}

impl Default for Settings {
  fn default() -> Self {
    Self {
      database: DatabaseConfig {
        host: "localhost".to_string(),
        port: 5432,
        username: "postgres".to_string(),
        password: "password".to_string(),
        database_name: "helium".to_string(),
        max_connections: 10,
        min_connections: 2,
        acquire_timeout_seconds: 30,
        idle_timeout_seconds: 600,
        max_lifetime_seconds: 1800,
      },
      ingestor: IngestorConfig {
        grpc_endpoint: "http://localhost:8080".to_string(),
        timeout_seconds: 30,
        max_retries: 3,
        retry_delay_seconds: 5,
        tls_enabled: false,
      },
      service: ServiceConfig {
        polling_interval_seconds: 10,
        batch_size: 100,
        max_concurrent_publishes: 5,
        health_check_port: 3000,
        watched_tables: vec![],
        fail_on_missing_tables: true,
        validation_retry_attempts: 3,
        validation_retry_delay_seconds: 30,
      },
      logging: LoggingConfig {
        level: "info".to_string(),
        format: "json".to_string(),
      },
    }
  }
}
