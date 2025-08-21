mod config;
mod database;
mod errors;
mod ingestor;
mod metrics;
mod service;

use anyhow::Result;
use config::Settings;
use service::AtomicDataPublisher;
use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
  // Initialize logging
  let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());

  tracing_subscriber::registry()
    .with(
      tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        format!("atomic_data_publisher={},sqlx=warn,reqwest=info", log_level).into()
      }),
    )
    .with(tracing_subscriber::fmt::layer().json())
    .init();

  info!("Starting Atomic Data Publisher v0.1.0");

  // Load configuration
  let settings = match Settings::new() {
    Ok(s) => {
      info!("Configuration loaded successfully");
      s
    }
    Err(e) => {
      error!("Failed to load configuration: {}", e);
      std::process::exit(1);
    }
  };

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

  // Setup graceful shutdown
  let service_for_shutdown = service.clone();
  let shutdown_handle = tokio::spawn(async move {
    match signal::ctrl_c().await {
      Ok(()) => {
        info!("Received Ctrl+C, initiating graceful shutdown");
        if let Err(e) = service_for_shutdown.shutdown().await {
          error!("Error during shutdown: {}", e);
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
          info!("Shutdown signal received");
          Ok(())
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

  // Validate ingestor configuration
  if settings.ingestor.base_url.is_empty() {
    return Err(anyhow::anyhow!("Ingestor base URL cannot be empty"));
  }

  if !settings.ingestor.base_url.starts_with("http://")
    && !settings.ingestor.base_url.starts_with("https://")
  {
    return Err(anyhow::anyhow!(
      "Ingestor base URL must start with http:// or https://"
    ));
  }

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

  // Validate watched tables
  if settings.service.watched_tables.is_empty() {
    warn!("No watched tables configured - service will not process any changes");
  }

  for table in &settings.service.watched_tables {
    if table.name.is_empty() {
      return Err(anyhow::anyhow!("Table name cannot be empty"));
    }

    if table.change_column.is_empty() {
      return Err(anyhow::anyhow!(
        "Change column cannot be empty for table: {}",
        table.name
      ));
    }

    if table.atomic_data_query.is_empty() {
      return Err(anyhow::anyhow!(
        "Atomic data query cannot be empty for table: {}",
        table.name
      ));
    }

    if !table.atomic_data_query.contains("$PRIMARY_KEY") {
      return Err(anyhow::anyhow!(
        "Atomic data query must contain $PRIMARY_KEY placeholder for table: {}",
        table.name
      ));
    }

    if table.publish_endpoint.is_empty() {
      return Err(anyhow::anyhow!(
        "Publish endpoint cannot be empty for table: {}",
        table.name
      ));
    }
  }

  info!("Configuration validation passed");
  Ok(())
}
