use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize, Clone)]
pub struct Settings {
  pub database: DatabaseConfig,
  pub solana: SolanaConfig,
  pub service: ServiceConfig,
  pub ingestor: IngestorConfig,
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
  pub required_tables: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SolanaConfig {
  pub rpc_url: String,
  pub timeout_seconds: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServiceConfig {
  pub polling_interval_seconds: u64,
  pub batch_size: u32,
  pub max_concurrent_publishes: u32,
  pub polling_jobs: Vec<PollingJob>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct IngestorConfig {
  pub endpoint: String,
  pub timeout_seconds: u64,
  pub max_retries: u32,
  pub retry_delay_seconds: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct PollingJob {
  pub name: String, // Unique identifier for polling state tracking (e.g., "atomic_mobile_hotspots")
  pub query_name: String, // Name of predefined query to execute
  pub parameters: serde_json::Value, // JSON object containing query parameters
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

  pub fn polling_interval(&self) -> Duration {
    Duration::from_secs(self.service.polling_interval_seconds)
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
        required_tables: vec![
          "asset_owners".to_string(),
          "key_to_assets".to_string(),
          "recipients".to_string(),
          "welcome_packs".to_string(),
          "rewards_recipients".to_string(),
          "mini_fanouts".to_string(),
        ],
      },
      solana: SolanaConfig {
        rpc_url: "https://api.mainnet-beta.solana.com".to_string(),
        timeout_seconds: 30,
      },
      service: ServiceConfig {
        polling_interval_seconds: 10,
        batch_size: 100,
        max_concurrent_publishes: 5,
        polling_jobs: vec![],
      },
      ingestor: IngestorConfig {
        endpoint: "http://localhost:8080".to_string(),
        timeout_seconds: 30,
        max_retries: 3,
        retry_delay_seconds: 2,
      },
      logging: LoggingConfig {
        level: "info".to_string(),
        format: "json".to_string(),
      },
    }
  }
}
