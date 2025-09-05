mod config;
mod database;
mod errors;
mod metrics;
mod protobuf;
mod publisher;
mod queries;
mod service;
mod solana_client;

use anyhow::Result;
use clap::{Parser, Subcommand};
use config::Settings;
use service::AtomicDataPublisher;
use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser)]
#[command(name = "atomic-data-publisher")]
#[command(about = "Helium Atomic Data Publisher - Efficiently process hotspot data changes")]
struct Cli {
  #[command(subcommand)]
  command: Commands,
}

#[derive(Subcommand)]
enum Commands {
  /// Start the atomic data publisher service
  Serve,
  /// Create performance indexes for better query performance
  CreateIndexes,
}

#[tokio::main]
async fn main() -> Result<()> {
  // Parse command line arguments
  let cli = Cli::parse();

  // Initialize logging
  let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());

  tracing_subscriber::registry()
    .with(
      tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        format!("atomic_data_publisher={},sqlx=warn,tonic=info", log_level).into()
      }),
    )
    .with(tracing_subscriber::fmt::layer().json())
    .init();

  match cli.command {
    Commands::Serve => run_service().await,
    Commands::CreateIndexes => create_indexes().await,
  }
}

async fn run_service() -> Result<()> {
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

async fn create_indexes() -> Result<()> {
  info!("Creating performance indexes for Atomic Data Publisher");

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

  // Create database client
  let database = match database::DatabaseClient::new(&settings.database, settings.service.polling_jobs).await {
    Ok(db) => db,
    Err(e) => {
      error!("Failed to create database client: {}", e);
      std::process::exit(1);
    }
  };

  // Create performance indexes
  if let Err(e) = database.create_performance_indexes().await {
    error!("Failed to create performance indexes: {}", e);
    std::process::exit(1);
  }

  info!("✅ Performance indexes created successfully");
  Ok(())
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
    return Err(anyhow::anyhow!("No required tables specified in configuration"));
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
        job.query_name, job.name
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
