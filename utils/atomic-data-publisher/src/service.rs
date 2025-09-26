use anyhow::Result;
use helium_crypto::Keypair;
use metrics_exporter_prometheus::PrometheusBuilder;
use std::sync::Arc;
use std::time::Duration;
use tokio::signal;
use tracing::{debug, error, info, warn};

use crate::config::{ServiceConfig, Settings};
use crate::database::DatabaseClient;
use crate::errors::AtomicDataError;
use crate::health_service::HealthService;
use crate::metrics::MetricsCollector;
use crate::polling_service::PollingService;
use crate::publisher::AtomicDataPublisher as Publisher;

#[derive(Debug)]
pub struct AtomicDataPublisher {
  database: Arc<DatabaseClient>,
  publisher: Arc<Publisher>,
  metrics: Arc<MetricsCollector>,
  config: Settings,
  shutdown_signal: tokio::sync::watch::Receiver<bool>,
  pub shutdown_sender: tokio::sync::watch::Sender<bool>,
}

impl AtomicDataPublisher {
  async fn validate_tables(database: &DatabaseClient, tables: &[String]) -> Result<(), AtomicDataError> {
    for table_name in tables {
      if !database.table_exists(table_name).await? {
        return Err(AtomicDataError::ConfigError(format!(
          "Required table '{}' does not exist",
          table_name
        )));
      }
    }
    Ok(())
  }

  async fn init_database(database: &DatabaseClient, service_config: &ServiceConfig) -> Result<(), AtomicDataError> {
    database.create_state_table().await?;

    if service_config.polling_jobs.is_empty() {
      warn!("No polling jobs configured");
    }
    Ok(())
  }

  pub async fn new(config: Settings) -> Result<Self, AtomicDataError> {
    info!("Initializing Atomic Data Publisher service");

    let metrics = Arc::new(MetricsCollector::new()?);

    let database = Arc::new(
      DatabaseClient::new_with_metrics(
        &config.database,
        config.service.polling_jobs.clone(),
        Some(metrics.clone())
      ).await?,
    );

    Self::validate_tables(&database, &config.database.required_tables).await?;
    Self::init_database(&database, &config.service).await?;
    database.init_polling_state().await?;
    database.cleanup_stale_jobs().await?;

    let keypair_path = config.signing.keypair_path.clone();
    let keypair_data = if std::path::Path::new(&keypair_path).exists() {
      std::fs::read(&keypair_path)?
    } else {
      return Err(AtomicDataError::ConfigError(format!(
        "Keypair file not found at {}. Please provide a valid keypair file.",
        keypair_path
      )));
    };

    let keypair = Keypair::try_from(&keypair_data[..])
      .map_err(|e| AtomicDataError::ConfigError(format!("Failed to load keypair from file: {}", e)))?;

    info!("Using keypair with public key: {}", keypair.public_key());

    let publisher = Arc::new(Publisher::new(
      config.service.polling_jobs.clone(),
      keypair,
      config.service.clone(),
      config.ingestor.clone(),
      metrics.clone(),
    ).await?);

    let (shutdown_sender, shutdown_signal) = tokio::sync::watch::channel(false);

    Ok(Self {
      database,
      publisher,
      metrics,
      config,
      shutdown_signal,
      shutdown_sender,
    })
  }

  pub async fn run(&self) -> Result<(), AtomicDataError> {
    self.health_check().await?;
    let (handles, _metrics_bind_addr) = self.spawn_background_tasks().await?;
    let shutdown_sender = self.shutdown_sender.clone();
    let signal_handle = tokio::spawn(async move {
      tokio::select! {
        _ = signal::ctrl_c() => {
          info!("Received Ctrl+C within service, initiating graceful shutdown");
        }
        _ = async {
          signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await
        } => {
          info!("Received SIGTERM within service, initiating graceful shutdown");
        }
      }

      if let Err(e) = shutdown_sender.send(true) {
        error!("Failed to send internal shutdown signal: {}", e);
      }
    });

    let mut shutdown_signal = self.shutdown_signal.clone();
    tokio::select! {
        _ = shutdown_signal.changed() => {
            info!("Shutdown signal received");
        }
        result = futures::future::try_join_all(handles) => {
            match result {
                Ok(results) => {
                    let failed_tasks = results.iter().filter(|r| r.is_err()).count();
                    if failed_tasks > 0 {
                        warn!("{} out of {} background tasks failed", failed_tasks, results.len());
                    } else {
                        info!("All background tasks completed successfully");
                    }
                }
                Err(e) => error!("Background task failure: {}", e),
            }
        }
        _ = signal_handle => {
          // Signal handler completed
        }
    }

    self.perform_graceful_shutdown().await?;
    info!("Atomic Data Publisher service stopped");
    Ok(())
  }

  async fn spawn_background_tasks(&self) -> Result<(Vec<tokio::task::JoinHandle<Result<(), AtomicDataError>>>, String), AtomicDataError> {
    let mut handles = Vec::new();
    let metrics_bind_addr = format!("0.0.0.0:{}", self.config.service.port);

    // Initialize Prometheus metrics exporter
    let builder = PrometheusBuilder::new()
      .with_http_listener(([0, 0, 0, 0], self.config.service.port));

    builder
      .install()
      .map_err(|e| AtomicDataError::NetworkError(format!("Failed to install Prometheus exporter: {}", e)))?;

    // Initialize all metrics after the exporter is installed
    self.metrics.initialize_metrics();

    info!("Metrics server started on {}", metrics_bind_addr);

    // Polling service
    let polling_service = PollingService::new(
      self.database.clone(),
      self.publisher.clone(),
      self.metrics.clone(),
      self.config.clone(),
    );
    let polling_handle = {
      let shutdown_signal = self.shutdown_signal.clone();
      tokio::spawn(async move {
        polling_service.run(shutdown_signal).await
      })
    };
    handles.push(polling_handle);

    // Health service
    let health_service = HealthService::new(
      self.database.clone(),
      self.publisher.clone(),
    );
    let health_handle = {
      let shutdown_signal = self.shutdown_signal.clone();
      tokio::spawn(async move {
        health_service.run(shutdown_signal).await
      })
    };
    handles.push(health_handle);

    // Periodic uptime update task
    let uptime_handle = {
      let metrics = self.metrics.clone();
      let mut shutdown_signal = self.shutdown_signal.clone();
      tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
          tokio::select! {
            _ = interval.tick() => {
              metrics.update_uptime();
            }
            _ = shutdown_signal.changed() => {
              break;
            }
          }
        }
        Ok(())
      })
    };
    handles.push(uptime_handle);

    Ok((handles, metrics_bind_addr))
  }

  async fn perform_graceful_shutdown(&self) -> Result<(), AtomicDataError> {
    info!("Performing graceful shutdown cleanup");

    if let Err(e) = self.database.cleanup_all_jobs().await {
      warn!("Failed to clean up running job states during shutdown: {}", e);
    }

    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(())
  }

  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    if let Err(e) = self.database.health_check().await {
      error!("Database health check failed: {}", e);
      return Err(AtomicDataError::DatabaseError(e.to_string()));
    }

    if let Err(e) = self.publisher.health_check().await {
      error!("Publisher health check failed: {}", e);
      return Err(e);
    }

    debug!("Health check passed");
    Ok(())
  }
}

