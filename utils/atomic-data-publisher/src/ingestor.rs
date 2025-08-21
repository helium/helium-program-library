use anyhow::Result;
use backoff::{future::retry, ExponentialBackoff};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::config::{IngestorConfig, WatchedTable};
use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtomicDataPayload {
  pub id: String,
  pub table_name: String,
  pub primary_key: String,
  pub change_column_value: String,
  pub changed_at: String,
  pub atomic_data: serde_json::Value,
  pub metadata: PayloadMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PayloadMetadata {
  pub service_name: String,
  pub version: String,
  pub timestamp: String,
  pub retry_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestorResponse {
  pub success: bool,
  pub message: Option<String>,
  pub id: Option<String>,
  pub errors: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct CircuitBreaker {
  failure_count: std::sync::Arc<std::sync::atomic::AtomicU32>,
  last_failure_time: std::sync::Arc<std::sync::Mutex<Option<std::time::Instant>>>,
  failure_threshold: u32,
  recovery_timeout: Duration,
}

impl CircuitBreaker {
  pub fn new(failure_threshold: u32, recovery_timeout: Duration) -> Self {
    Self {
      failure_count: std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0)),
      last_failure_time: std::sync::Arc::new(std::sync::Mutex::new(None)),
      failure_threshold,
      recovery_timeout,
    }
  }

  pub fn is_open(&self) -> bool {
    let current_failures = self
      .failure_count
      .load(std::sync::atomic::Ordering::Relaxed);

    if current_failures >= self.failure_threshold {
      if let Ok(last_failure) = self.last_failure_time.lock() {
        if let Some(last_time) = *last_failure {
          return last_time.elapsed() < self.recovery_timeout;
        }
      }
    }

    false
  }

  pub fn record_success(&self) {
    self
      .failure_count
      .store(0, std::sync::atomic::Ordering::Relaxed);
    if let Ok(mut last_failure) = self.last_failure_time.lock() {
      *last_failure = None;
    }
  }

  pub fn record_failure(&self) {
    self
      .failure_count
      .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if let Ok(mut last_failure) = self.last_failure_time.lock() {
      *last_failure = Some(std::time::Instant::now());
    }
  }
}

#[derive(Debug, Clone)]
pub struct IngestorClient {
  client: Client,
  config: IngestorConfig,
  watched_tables: Vec<WatchedTable>,
  circuit_breaker: CircuitBreaker,
}

impl IngestorClient {
  pub fn new(config: IngestorConfig, watched_tables: Vec<WatchedTable>) -> Result<Self> {
    let client = Client::builder()
      .timeout(Duration::from_secs(config.timeout_seconds))
      .pool_idle_timeout(Duration::from_secs(30))
      .pool_max_idle_per_host(10)
      .user_agent("atomic-data-publisher/0.1.0")
      .build()?;

    let circuit_breaker = CircuitBreaker::new(5, Duration::from_secs(60));

    Ok(Self {
      client,
      config,
      watched_tables,
      circuit_breaker,
    })
  }

  /// Publish a batch of atomic data changes to the ingestor service
  pub async fn publish_changes(&self, changes: Vec<ChangeRecord>) -> Result<Vec<String>> {
    if changes.is_empty() {
      return Ok(vec![]);
    }

    info!("Publishing {} changes to ingestor service", changes.len());

    let mut published_ids = Vec::new();
    let mut failed_changes = Vec::new();

    for change in changes {
      match self.publish_single_change(&change).await {
        Ok(id) => {
          published_ids.push(id);
          debug!(
            "Successfully published change for {}/{}",
            change.table_name, change.primary_key
          );
        }
        Err(e) => {
          error!(
            "Failed to publish change for {}/{}: {}",
            change.table_name, change.primary_key, e
          );
          failed_changes.push(change);
        }
      }
    }

    if !failed_changes.is_empty() {
      warn!("{} changes failed to publish", failed_changes.len());
    }

    Ok(published_ids)
  }

  /// Publish a single change record
  async fn publish_single_change(&self, change: &ChangeRecord) -> Result<String, AtomicDataError> {
    // Check circuit breaker
    if self.circuit_breaker.is_open() {
      return Err(AtomicDataError::CircuitBreakerOpen(
        "Ingestor service circuit breaker is open".to_string(),
      ));
    }

    // Find the endpoint for this table
    let table_config = self
      .watched_tables
      .iter()
      .find(|t| t.name == change.table_name)
      .ok_or_else(|| {
        AtomicDataError::InvalidData(format!(
          "No configuration found for table: {}",
          change.table_name
        ))
      })?;

    // Create payload
    let payload = AtomicDataPayload {
      id: uuid::Uuid::new_v4().to_string(),
      table_name: change.table_name.clone(),
      primary_key: change.primary_key.clone(),
      change_column_value: change.change_column_value.clone(),
      changed_at: change.changed_at.to_rfc3339(),
      atomic_data: change.atomic_data.clone(),
      metadata: PayloadMetadata {
        service_name: "atomic-data-publisher".to_string(),
        version: "0.1.0".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        retry_count: 0,
      },
    };

    // Build full URL
    let url = format!(
      "{}/{}",
      self.config.base_url.trim_end_matches('/'),
      table_config.publish_endpoint.trim_start_matches('/')
    );

    // Execute with retry logic
    let operation = || async {
      debug!("Sending payload to: {}", url);

      let response = self.client.post(&url).json(&payload).send().await?;

      let status = response.status();

      if status.is_success() {
        let ingestor_response: IngestorResponse = response.json().await?;

        if ingestor_response.success {
          self.circuit_breaker.record_success();
          Ok(ingestor_response.id.unwrap_or_else(|| payload.id.clone()))
        } else {
          let error_msg = ingestor_response
            .message
            .or_else(|| ingestor_response.errors.map(|e| e.join(", ")))
            .unwrap_or_else(|| "Unknown ingestor error".to_string());

          Err(AtomicDataError::IngestorError {
            status: status.as_u16(),
            message: error_msg,
          })
        }
      } else {
        let error_text = response
          .text()
          .await
          .unwrap_or_else(|_| "Unknown error".to_string());

        // Record failure for circuit breaker
        self.circuit_breaker.record_failure();

        Err(AtomicDataError::IngestorError {
          status: status.as_u16(),
          message: error_text,
        })
      }
    };

    // Configure retry policy
    let backoff = ExponentialBackoff {
      initial_interval: Duration::from_secs(self.config.retry_delay_seconds),
      max_interval: Duration::from_secs(self.config.retry_delay_seconds * 8),
      max_elapsed_time: Some(Duration::from_secs(
        self.config.retry_delay_seconds * self.config.max_retries as u64 * 2,
      )),
      ..Default::default()
    };

    retry(backoff, operation).await.map_err(|e| {
      error!(
        "All retry attempts exhausted for {}/{}: {}",
        change.table_name, change.primary_key, e
      );
      AtomicDataError::RetryExhausted(e.to_string())
    })
  }

  /// Health check the ingestor service
  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    if self.circuit_breaker.is_open() {
      return Err(AtomicDataError::CircuitBreakerOpen(
        "Circuit breaker is open".to_string(),
      ));
    }

    let health_url = format!("{}/health", self.config.base_url.trim_end_matches('/'));

    let response = self.client.get(&health_url).send().await?;

    if response.status().is_success() {
      self.circuit_breaker.record_success();
      Ok(())
    } else {
      self.circuit_breaker.record_failure();
      Err(AtomicDataError::ServiceUnavailable(format!(
        "Health check failed with status: {}",
        response.status()
      )))
    }
  }

  /// Get circuit breaker status
  pub fn circuit_breaker_status(&self) -> CircuitBreakerStatus {
    CircuitBreakerStatus {
      is_open: self.circuit_breaker.is_open(),
      failure_count: self
        .circuit_breaker
        .failure_count
        .load(std::sync::atomic::Ordering::Relaxed),
      threshold: self.circuit_breaker.failure_threshold,
    }
  }
}

#[derive(Debug, Clone, Serialize)]
pub struct CircuitBreakerStatus {
  pub is_open: bool,
  pub failure_count: u32,
  pub threshold: u32,
}
