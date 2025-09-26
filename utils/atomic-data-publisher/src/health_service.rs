use std::time::Duration;
use tokio::time::interval;
use tracing::{error, info};

use crate::database::DatabaseClient;
use crate::errors::AtomicDataError;
use crate::publisher::AtomicDataPublisher as Publisher;

const HEALTH_CHECK_INTERVAL_SECONDS: u64 = 30;

#[derive(Debug)]
pub struct HealthService {
  database: std::sync::Arc<DatabaseClient>,
  publisher: std::sync::Arc<Publisher>,
}

impl HealthService {
  pub fn new(
    database: std::sync::Arc<DatabaseClient>,
    publisher: std::sync::Arc<Publisher>,
  ) -> Self {
    Self { database, publisher }
  }

  pub async fn run(
    &self,
    mut shutdown_signal: tokio::sync::watch::Receiver<bool>,
  ) -> Result<(), AtomicDataError> {
    let mut interval = interval(Duration::from_secs(HEALTH_CHECK_INTERVAL_SECONDS));

    loop {
      tokio::select! {
          _ = interval.tick() => {
              if let Err(e) = self.health_check().await {
                  error!("Health check failed: {}", e);
              }
          }
          _ = shutdown_signal.changed() => {
              if *shutdown_signal.borrow() {
                  info!("Shutting down health check service");
                  break;
              }
          }
      }
    }

    Ok(())
  }

  async fn health_check(&self) -> Result<(), AtomicDataError> {
    if let Err(e) = self.database.health_check().await {
      error!("Database health check failed: {}", e);
      return Err(AtomicDataError::DatabaseError(e.to_string()));
    }

    if let Err(e) = self.publisher.health_check().await {
      error!("Publisher health check failed: {}", e);
      return Err(e);
    }

    tracing::debug!("Health check passed");
    Ok(())
  }
}
