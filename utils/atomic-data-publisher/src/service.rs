use std::{sync::Arc, time::Duration};

use anyhow::Result;
use helium_crypto::Keypair;
use metrics_exporter_prometheus::PrometheusBuilder;
use tokio::signal;
use tracing::{debug, error, info, warn};
use triggered::{trigger, Listener, Trigger};

use crate::{
  config::{ServiceConfig, Settings},
  database::DatabaseClient,
  errors::AtomicDataError,
  health_service::HealthService,
  metrics,
  polling_service::PollingService,
  publisher::AtomicDataPublisher as Publisher,
};

#[derive(Debug)]
pub struct AtomicDataPublisher {
  database: Arc<DatabaseClient>,
  publisher: Arc<Publisher>,
  config: Settings,
  shutdown_trigger: Trigger,
  shutdown_listener: Listener,
}

impl AtomicDataPublisher {
  async fn validate_tables(
    database: &DatabaseClient,
    tables: &[String],
  ) -> Result<(), AtomicDataError> {
    for table_name in tables {
      if !database.table_exists(table_name).await? {
        return Err(AtomicDataError::ConfigError(config::ConfigError::Message(
          format!("Required table '{table_name}' does not exist",),
        )));
      }
    }
    Ok(())
  }

  async fn init_database(
    service_config: &ServiceConfig,
  ) -> Result<(), AtomicDataError> {
    if service_config.polling_jobs.is_empty() {
      warn!("No polling jobs configured");
    }
    Ok(())
  }

  pub async fn new(config: Settings) -> Result<Self, AtomicDataError> {
    info!("Initializing Atomic Data Publisher service");

    let database = Arc::new(
      DatabaseClient::new(
        &config.database,
        config.service.polling_jobs.clone(),
        config.service.dry_run,
      )
      .await?,
    );

    Self::validate_tables(&database, &config.database.required_tables).await?;
    Self::init_database(&config.service).await?;
    database.init_polling_state().await?;
    database.cleanup_stale_jobs().await?;

    let keypair_path = config.signing.keypair_path.clone();
    let keypair_data = if std::path::Path::new(&keypair_path).exists() {
      std::fs::read(&keypair_path)?
    } else {
      return Err(AtomicDataError::ConfigError(config::ConfigError::Message(
        format!("Keypair file not found at {keypair_path}. Please provide a valid keypair file.",),
      )));
    };

    let keypair = Keypair::try_from(&keypair_data[..]).map_err(|e| {
      AtomicDataError::ConfigError(config::ConfigError::Message(format!(
        "Failed to load keypair from file: {e}",
      )))
    })?;

    info!("Using keypair with public key: {}", keypair.public_key());

    let publisher = Arc::new(
      Publisher::new(
        config.service.polling_jobs.clone(),
        keypair,
        config.service.clone(),
        config.ingestor.clone(),
      )
      .await?,
    );

    let (shutdown_trigger, shutdown_listener) = trigger();

    Ok(Self {
      database,
      publisher,
      config,
      shutdown_trigger,
      shutdown_listener,
    })
  }

  pub async fn run(&self) -> Result<(), AtomicDataError> {
    self.health_check().await?;
    let (handles, _metrics_bind_addr) = self.spawn_background_tasks().await?;

    // Set up signal handling to trigger shutdown
    let shutdown_trigger = self.shutdown_trigger.clone();
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

      shutdown_trigger.trigger();
    });

    tokio::select! {
        _ = self.shutdown_listener.clone() => {
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

  async fn spawn_background_tasks(
    &self,
  ) -> Result<
    (
      Vec<tokio::task::JoinHandle<Result<(), AtomicDataError>>>,
      String,
    ),
    AtomicDataError,
  > {
    let mut handles = Vec::new();
    let metrics_bind_addr = format!("0.0.0.0:{}", self.config.service.port);

    // Initialize Prometheus metrics exporter
    let builder =
      PrometheusBuilder::new().with_http_listener(([0, 0, 0, 0], self.config.service.port));

    builder.install().map_err(|e| {
      AtomicDataError::NetworkError(format!("Failed to install Prometheus exporter: {}", e))
    })?;

    // Initialize all metrics after the exporter is installed
    metrics::initialize_metrics();

    info!("Metrics server started on {}", metrics_bind_addr);

    // Polling service
    let polling_service = Arc::new(PollingService::new(
      self.database.clone(),
      self.publisher.clone(),
      self.config.clone(),
    ));
    let polling_handle = {
      let shutdown_listener = self.shutdown_listener.clone();
      let polling_service = polling_service.clone();
      tokio::spawn(async move { polling_service.run(shutdown_listener).await })
    };
    handles.push(polling_handle);

    // Health service
    let health_service = HealthService::new(
      self.database.clone(),
      self.publisher.clone(),
      polling_service,
      self.config.clone(),
    );
    let health_handle = {
      let shutdown_listener = self.shutdown_listener.clone();
      tokio::spawn(async move { health_service.run(shutdown_listener).await })
    };
    handles.push(health_handle);

    // Periodic uptime update task
    let uptime_handle = {
      let shutdown_listener = self.shutdown_listener.clone();
      tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
          tokio::select! {
            _ = interval.tick() => {
              metrics::update_uptime();
            }
            _ = shutdown_listener.clone() => {
              break;
            }
          }
        }
        Ok(())
      })
    };
    handles.push(uptime_handle);

    // Periodic database pool refresh task for IAM auth token renewal
    // Refresh every 12 minutes to stay under the 15-minute IAM token expiry with 3-minute buffer
    let pool_refresh_handle = {
      let shutdown_listener = self.shutdown_listener.clone();
      let database = self.database.clone();
      tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(720)); // 12 minutes
        interval.tick().await;
        loop {
          tokio::select! {
            _ = interval.tick() => {
              // Wait for any running jobs to complete before refreshing pool
              // This prevents swapping the pool while queries are in flight
              let mut waited = false;
              loop {
                match database.any_job_running().await {
                  Ok(true) => {
                    if !waited {
                      info!("Pool refresh scheduled but jobs are running - waiting for jobs to complete");
                      waited = true;
                    }
                    tokio::time::sleep(Duration::from_secs(1)).await;
                  }
                  Ok(false) => {
                    // No jobs running, safe to refresh
                    if waited {
                      info!("Jobs completed, proceeding with pool refresh");
                    }
                    break;
                  }
                  Err(e) => {
                    error!("Failed to check job status before pool refresh: {}", e);
                    // Try to refresh anyway
                    break;
                  }
                }
              }

              match database.refresh_pool().await {
                Ok(_) => {
                  info!("Database pool refreshed successfully (periodic)");
                }
                Err(e) => {
                  error!("Failed to refresh database pool (periodic): {}", e);
                  // Continue running - the next refresh attempt might succeed
                }
              }
            }
            _ = shutdown_listener.clone() => {
              break;
            }
          }
        }
        Ok(())
      })
    };
    handles.push(pool_refresh_handle);

    // Periodic stale job cleanup task
    // Run every 5 minutes to detect and recover from stuck jobs
    let stale_job_cleanup_handle = {
      let shutdown_listener = self.shutdown_listener.clone();
      let database = self.database.clone();
      tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes
        interval.tick().await;
        loop {
          tokio::select! {
            _ = interval.tick() => {
              match database.cleanup_stale_jobs().await {
                Ok(_) => {
                  debug!("Periodic stale job cleanup completed");
                }
                Err(e) => {
                  error!("Failed to cleanup stale jobs: {}", e);
                  // Continue running - the next cleanup attempt might succeed
                }
              }
            }
            _ = shutdown_listener.clone() => {
              break;
            }
          }
        }
        Ok(())
      })
    };
    handles.push(stale_job_cleanup_handle);

    Ok((handles, metrics_bind_addr))
  }

  async fn perform_graceful_shutdown(&self) -> Result<(), AtomicDataError> {
    info!("Performing graceful shutdown cleanup");

    if let Err(e) = self.database.cleanup_all_jobs().await {
      warn!(
        "Failed to clean up running job states during shutdown: {}",
        e
      );
    }

    Ok(())
  }

  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    if let Err(e) = self.database.health_check().await {
      error!("Database health check failed: {}", e);
      return Err(AtomicDataError::DatabaseError(e));
    }

    if let Err(e) = self.publisher.health_check().await {
      error!("Publisher health check failed: {}", e);
      return Err(e);
    }

    debug!("Health check passed");
    Ok(())
  }
}
