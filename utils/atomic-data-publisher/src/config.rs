use std::time::Duration;

use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Settings {
  pub database: DatabaseConfig,
  pub service: ServiceConfig,
  pub ingestor: IngestorConfig,
  pub logging: LoggingConfig,
  pub signing: SigningConfig,
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
pub struct ServiceConfig {
  pub polling_interval_seconds: u64,
  pub batch_size: u32,
  pub max_concurrent_publishes: u32,
  pub polling_jobs: Vec<PollingJob>,
  pub dry_run: bool,
  #[serde(default)]
  pub dry_run_failure_rate: f32,
  pub port: u16,
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
  pub name: String,
  pub query_name: String,
  pub parameters: serde_json::Value,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
  pub level: String,
  pub format: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SigningConfig {
  pub keypair_path: String,
}

impl Settings {
  pub fn new() -> Result<Self, ConfigError> {
    let s = Config::builder()
      // Database defaults
      .set_default("database.host", "localhost")?
      .set_default("database.port", 5432)?
      .set_default("database.username", "postgres")?
      .set_default("database.password", "postgres")?
      .set_default("database.database_name", "helium")?
      .set_default("database.max_connections", 10)?
      .set_default("database.min_connections", 2)?
      .set_default("database.acquire_timeout_seconds", 30)?
      .set_default("database.idle_timeout_seconds", 600)?
      .set_default("database.max_lifetime_seconds", 1800)?
      // Service defaults
      .set_default("service.polling_interval_seconds", 10)?
      .set_default("service.batch_size", 500)?
      .set_default("service.max_concurrent_publishes", 50)?
      .set_default("service.dry_run", false)?
      .set_default("service.dry_run_failure_rate", 0.0)?
      .set_default("service.port", 8000)?
      // Ingestor defaults
      .set_default("ingestor.timeout_seconds", 30)?
      .set_default("ingestor.max_retries", 3)?
      .set_default("ingestor.retry_delay_seconds", 5)?
      // Logging defaults
      .set_default("logging.level", "info")?
      .set_default("logging.format", "json")?
      // Load from files and environment
      .add_source(File::with_name("settings").required(true))
      .add_source(Environment::default().separator("__").try_parsing(true))
      .build()?;

    s.try_deserialize()
  }

  pub fn polling_interval(&self) -> Duration {
    Duration::from_secs(self.service.polling_interval_seconds)
  }
}
