mod config;
mod database;
mod errors;
mod health_service;
mod metrics;
mod polling_service;
mod protobuf;
mod publisher;
mod queries;
mod service;

use anyhow::{Context, Result};
use config::{LoggingConfig, Settings};
use service::AtomicDataPublisher;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
  dotenv::dotenv().ok();

  run_service().await
}

async fn run_service() -> Result<()> {
  let settings = Settings::new().context("Failed to load configuration")?;

  initialize_logging(&settings.logging)?;

  info!("Starting Atomic Data Publisher");
  info!("Configuration loaded successfully");

  validate_config(&settings).context("Configuration validation failed")?;

  let service = AtomicDataPublisher::new(settings)
    .await
    .context("Failed to initialize service")?;
  info!("Atomic Data Publisher service initialized successfully");

  let service_result = service.run().await;

  match service_result {
    Ok(_) => {
      info!("Atomic Data Publisher service stopped gracefully");
      Ok(())
    }
    Err(e) => {
      error!("Service failed: {}", e);
      Err(e.into())
    }
  }
}

fn validate_config(settings: &Settings) -> Result<()> {
  // Validate database configuration
  database::DatabaseClient::validate_database_config(&settings.database)
    .context("Database configuration validation failed")?;

  // Validate service configuration
  if settings.service.polling_interval_seconds == 0 {
    anyhow::bail!("Service polling interval must be greater than 0 seconds, got: {}", settings.service.polling_interval_seconds);
  }

  if settings.database.required_tables.is_empty() {
    anyhow::bail!("No required tables specified in configuration. At least one table must be configured for monitoring.");
  }

  // Validate polling jobs
  database::DatabaseClient::validate_polling_jobs(&settings.service.polling_jobs)
    .context("Polling jobs validation failed")?;

  info!("Configuration validation passed");
  Ok(())
}

fn initialize_logging(logging_config: &LoggingConfig) -> Result<()> {
  let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| logging_config.level.clone());

  let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| {
      format!(
        "atomic_data_publisher={},atomic_hotspot_events={},sqlx=warn,tonic=info",
        log_level, log_level
      )
      .into()
    });

  let subscriber = tracing_subscriber::registry().with(env_filter);

  match logging_config.format.as_str() {
    "json" => {
      subscriber
        .with(tracing_subscriber::fmt::layer().json())
        .init();
    }
    "pretty" | "text" => {
      subscriber
        .with(tracing_subscriber::fmt::layer().pretty())
        .init();
    }
    _ => {
      subscriber
        .with(tracing_subscriber::fmt::layer())
        .init();
    }
  }

  Ok(())
}
