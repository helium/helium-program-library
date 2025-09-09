mod config;
mod database;
mod errors;
mod metrics;
mod protobuf;
mod publisher;
mod queries;
mod service;
mod solana;

use anyhow::Result;
use config::{LoggingConfig, Settings};
use service::AtomicDataPublisher;
use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
  run_service().await
}

async fn run_service() -> Result<()> {
  // Load configuration first (before logging setup)
  let settings = match Settings::new() {
    Ok(s) => s,
    Err(e) => {
      eprintln!("Failed to load configuration: {}", e);
      std::process::exit(1);
    }
  };

  // Initialize logging based on configuration
  initialize_logging(&settings.logging)?;

  info!("Starting Atomic Data Publisher v0.1.0");
  info!("Configuration loaded successfully");

  // Validate configuration
  if let Err(e) = validate_config(&settings) {
    error!("Configuration validation failed: {}", e);
    std::process::exit(1);
  }

  // Create and start the service
  let service = match AtomicDataPublisher::new(settings).await {
    Ok(s) => {
      info!("Atomic Data Publisher service initialized successfully");
      Arc::new(s)
    }
    Err(e) => {
      error!("Failed to initialize service: {}", e);
      std::process::exit(1);
    }
  };

  // Setup graceful shutdown signal handler
  let shutdown_sender = service.shutdown_sender.clone();
  let shutdown_handle = tokio::spawn(async move {
    match signal::ctrl_c().await {
      Ok(()) => {
        info!("Received Ctrl+C, initiating graceful shutdown");
        if let Err(e) = shutdown_sender.send(true) {
          error!("Failed to send shutdown signal: {}", e);
        }
      }
      Err(err) => {
        error!("Unable to listen for shutdown signal: {}", err);
      }
    }
  });

  // Start the service
  let service_result = tokio::select! {
      result = service.run() => result,
      _ = shutdown_handle => {
          info!("Shutdown signal received, waiting for service to complete cleanup");
          // Wait for the service to finish its cleanup
          service.run().await
      }
  };

  match service_result {
    Ok(_) => {
      info!("Atomic Data Publisher service stopped gracefully");
      std::process::exit(0);
    }
    Err(e) => {
      error!("Service failed: {}", e);
      std::process::exit(1);
    }
  }
}


/// Validate the configuration before starting the service
fn validate_config(settings: &Settings) -> Result<()> {
  // Validate database configuration
  if settings.database.host.is_empty() {
    return Err(anyhow::anyhow!("Database host cannot be empty"));
  }

  if settings.database.username.is_empty() {
    return Err(anyhow::anyhow!("Database username cannot be empty"));
  }

  if settings.database.database_name.is_empty() {
    return Err(anyhow::anyhow!("Database name cannot be empty"));
  }

  if settings.database.max_connections == 0 {
    return Err(anyhow::anyhow!(
      "Database max_connections must be greater than 0"
    ));
  }

  // Note: Ingestor validation skipped - we're logging protobuf events instead of sending to gRPC

  // Validate service configuration
  if settings.service.polling_interval_seconds == 0 {
    return Err(anyhow::anyhow!("Polling interval must be greater than 0"));
  }

  if settings.service.batch_size == 0 {
    return Err(anyhow::anyhow!("Batch size must be greater than 0"));
  }

  if settings.service.max_concurrent_publishes == 0 {
    return Err(anyhow::anyhow!(
      "Max concurrent publishes must be greater than 0"
    ));
  }

  // Validate required tables are specified
  if settings.database.required_tables.is_empty() {
    return Err(anyhow::anyhow!(
      "No required tables specified in configuration"
    ));
  }

  // Validate Solana RPC configuration
  if settings.solana.rpc_url.is_empty() {
    return Err(anyhow::anyhow!("Solana RPC URL cannot be empty"));
  }

  if settings.solana.timeout_seconds == 0 {
    return Err(anyhow::anyhow!("Solana timeout must be greater than 0"));
  }

  // Validate polling jobs
  if settings.service.polling_jobs.is_empty() {
    warn!("No polling jobs configured - service will not process any changes");
  }

  for job in &settings.service.polling_jobs {
    if job.name.is_empty() {
      return Err(anyhow::anyhow!("Job name cannot be empty"));
    }

    if job.query_name.is_empty() {
      return Err(anyhow::anyhow!(
        "Query name cannot be empty for job: {}",
        job.name
      ));
    }

    // Validate that the query exists
    if crate::queries::AtomicHotspotQueries::get_query(&job.query_name).is_none() {
      return Err(anyhow::anyhow!(
        "Unknown query '{}' for job '{}'",
        job.query_name,
        job.name
      ));
    }

    // Validate parameters are provided
    if job.parameters.is_null() || !job.parameters.is_object() {
      return Err(anyhow::anyhow!(
        "Parameters must be a valid JSON object for job '{}'",
        job.name
      ));
    }
  }

  info!("Configuration validation passed");
  Ok(())
}

/// Initialize logging based on configuration
fn initialize_logging(logging_config: &LoggingConfig) -> Result<()> {
  let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| logging_config.level.clone());

  let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| format!("atomic_data_publisher={},atomic_hotspot_events={},sqlx=warn,tonic=info", log_level, log_level).into());

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
      subscriber.with(tracing_subscriber::fmt::layer()).init();
    }
  }

  Ok(())
}
