use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use chrono;

use crate::config::{IngestorConfig, PollingJob};
use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;
use crate::protobuf::build_hotspot_update_request;

#[derive(Debug, Clone)]
pub struct PublishResult {
  pub success: bool,
  pub timestamp_ms: u64,
  pub error_message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AtomicDataPublisher {
  config: IngestorConfig,
  polling_jobs: Vec<PollingJob>,
  keypair: Arc<Keypair>,
}

impl AtomicDataPublisher {
  pub async fn new(config: IngestorConfig, polling_jobs: Vec<PollingJob>, keypair: Keypair) -> Result<Self> {
    info!("Initializing AtomicDataPublisher for logging protobuf events (no gRPC endpoint)");

    Ok(Self {
      config,
      polling_jobs,
      keypair: Arc::new(keypair),
    })
  }

  /// Publish a batch of atomic data changes to the ingestor service
  pub async fn publish_changes(&self, changes: Vec<ChangeRecord>) -> Result<Vec<String>> {
    if changes.is_empty() {
      return Ok(vec![]);
    }

    debug!("Publishing {} changes to ingestor service", changes.len());

    let mut published_ids = Vec::new();
    let mut failed_changes = Vec::new();

    for change in changes {
      match self.publish_single_change(&change).await {
        Ok(result) => {
          if result.success {
            published_ids.push(format!("{}_{}", change.table_name, change.primary_key));
            debug!(
              "Successfully published change for {}/{}",
              change.table_name, change.primary_key
            );
          } else {
            error!(
              "Failed to publish change for {}/{}: {}",
              change.table_name,
              change.primary_key,
              result.error_message.unwrap_or_else(|| "Unknown error".to_string())
            );
            failed_changes.push(change);
          }
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

  /// Log a single change record as protobuf event
  async fn publish_single_change(&self, change: &ChangeRecord) -> Result<PublishResult, AtomicDataError> {
    // Find the polling job configuration
    let job_config = self
      .polling_jobs
      .iter()
      .find(|j| j.name == change.table_name)
      .ok_or_else(|| {
        AtomicDataError::InvalidData(format!(
          "No configuration found for job: {}",
          change.table_name
        ))
      })?;

    // Extract hotspot_type from job parameters
    let hotspot_type_str = job_config.parameters.get("hotspot_type")
      .and_then(|v| v.as_str())
      .unwrap_or("mobile"); // Default to mobile if not specified

    // Build protobuf request with proper signing
    let _hotspot_request = build_hotspot_update_request(
      change,
      hotspot_type_str,
      &self.keypair,
    )?;

    // Log the atomic data event instead of sending to gRPC
    let timestamp_ms = chrono::Utc::now().timestamp_millis() as u64;

    // The atomic data is already a JSON Value, no need to parse
    let atomic_data = &change.atomic_data;

    let event_log = serde_json::json!({
      "event_type": "atomic_hotspot_update",
      "hotspot_type": hotspot_type_str,
      "table_name": change.table_name,
      "primary_key": change.primary_key,
      "change_column_value": change.change_column_value,
      "timestamp_ms": timestamp_ms,
      "signer": self.keypair.public_key().to_string(),
      "atomic_data": atomic_data
    });

    debug!(
      target: "atomic_hotspot_events",
      "ATOMIC_HOTSPOT_UPDATE: {}",
      serde_json::to_string(&event_log).unwrap_or_else(|_| "serialization_error".to_string())
    );

    Ok(PublishResult {
      success: true,
      timestamp_ms,
      error_message: None,
    })
  }

  /// Health check the publisher (now just validates keypair)
  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    // Since we're logging instead of using gRPC, just validate that we have a valid keypair
    let public_key = self.keypair.public_key();
    debug!("Publisher health check passed - keypair public key: {}", public_key);
    Ok(())
  }
}
