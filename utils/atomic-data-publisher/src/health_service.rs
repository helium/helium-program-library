use std::time::Duration;

use tokio::time::interval;
use tracing::{debug, error, info};
use triggered::Listener;

use crate::{
  config::Settings, database::DatabaseClient, errors::AtomicDataError,
  polling_service::PollingService, publisher::AtomicDataPublisher as Publisher,
};

const HEALTH_CHECK_INTERVAL_SECONDS: u64 = 30;

#[derive(Debug)]
pub struct HealthService {
  database: std::sync::Arc<DatabaseClient>,
  publisher: std::sync::Arc<Publisher>,
  polling_service: std::sync::Arc<PollingService>,
  config: Settings,
}

impl HealthService {
  pub fn new(
    database: std::sync::Arc<DatabaseClient>,
    publisher: std::sync::Arc<Publisher>,
    polling_service: std::sync::Arc<PollingService>,
    config: Settings,
  ) -> Self {
    Self {
      database,
      publisher,
      polling_service,
      config,
    }
  }

  pub async fn run(&self, shutdown_listener: Listener) -> Result<(), AtomicDataError> {
    let mut interval = interval(Duration::from_secs(HEALTH_CHECK_INTERVAL_SECONDS));

    loop {
      tokio::select! {
          _ = interval.tick() => {
              if let Err(e) = self.health_check().await {
                  error!("Health check failed: {}", e);
              }
          }
          _ = shutdown_listener.clone() => {
              info!("Shutting down health check service");
              break;
          }
      }
    }

    Ok(())
  }

  async fn health_check(&self) -> Result<(), AtomicDataError> {
    if let Err(e) = self.database.health_check().await {
      error!("Database health check failed: {}", e);
      return Err(AtomicDataError::DatabaseError(e));
    }

    if let Err(e) = self.publisher.health_check().await {
      error!("Publisher health check failed: {}", e);
      return Err(e);
    }

    if let Err(e) = self.polling_service.health_check().await {
      error!("Polling service health check failed: {}", e);
      return Err(e);
    }

    // Check metrics server health
    if let Err(e) = self.check_metrics_server().await {
      error!("Metrics server health check failed: {}", e);
      return Err(e);
    }

    tracing::debug!("Health check passed");
    Ok(())
  }

  async fn check_metrics_server(&self) -> Result<(), AtomicDataError> {
    let metrics_url = format!("http://localhost:{}/metrics", self.config.service.port);

    match tokio::time::timeout(
      std::time::Duration::from_secs(5),
      reqwest::get(&metrics_url),
    )
    .await
    {
      Ok(Ok(response)) => {
        if response.status().is_success() {
          debug!("Metrics server health check passed");
          Ok(())
        } else {
          Err(AtomicDataError::NetworkError(format!(
            "Metrics server returned status: {}",
            response.status()
          )))
        }
      }
      Ok(Err(e)) => Err(AtomicDataError::NetworkError(format!(
        "Metrics server request failed: {}",
        e
      ))),
      Err(_) => Err(AtomicDataError::NetworkError(
        "Metrics server request timed out".to_string(),
      )),
    }
  }
}
