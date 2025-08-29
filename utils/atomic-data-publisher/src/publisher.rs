use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use serde_json;
use chrono;
use bs58;

use crate::config::{IngestorConfig, WatchedTable};
use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;
use crate::protobuf::{build_hotspot_update_request, HotspotUpdateRequest};

#[derive(Debug, Clone)]
pub struct PublishResult {
  pub success: bool,
  pub timestamp_ms: u64,
  pub error_message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AtomicDataPublisher {
  config: IngestorConfig,
  watched_tables: Vec<WatchedTable>,
  keypair: Arc<Keypair>,
}

impl AtomicDataPublisher {
  pub async fn new(config: IngestorConfig, watched_tables: Vec<WatchedTable>, keypair: Keypair) -> Result<Self> {
    info!("Initializing AtomicDataPublisher for logging protobuf events (no gRPC endpoint)");

    Ok(Self {
      config,
      watched_tables,
      keypair: Arc::new(keypair),
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
    // Find the table configuration
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

    // Build protobuf request with proper signing
    let hotspot_request = build_hotspot_update_request(
      change,
      &table_config.hotspot_type,
      &self.keypair,
    )?;

    // Log the protobuf message instead of sending it
    let timestamp_ms = chrono::Utc::now().timestamp_millis() as u64;

    match &hotspot_request {
      HotspotUpdateRequest::Mobile(req) => {
        // Serialize the protobuf message for logging
        let serialized = serde_json::json!({
          "event_type": "mobile_hotspot_update",
          "table_name": change.table_name,
          "primary_key": change.primary_key,
          "change_column_value": change.change_column_value,
          "timestamp_ms": timestamp_ms,
          "signer": req.signer,
          "signature_length": req.signature.len(),
          "atomic_data": change.atomic_data,
          "protobuf_data": {
            "block_height": req.update.as_ref().map(|u| u.block_height),
            "block_time_seconds": req.update.as_ref().map(|u| u.block_time_seconds),
            "pub_key": req.update.as_ref().and_then(|u| u.pub_key.as_ref()).map(|pk| bs58::encode(&pk.value).into_string()),
            "asset": req.update.as_ref().and_then(|u| u.asset.as_ref()).map(|a| bs58::encode(&a.value).into_string()),
            "metadata": req.update.as_ref().and_then(|u| u.metadata.as_ref()).map(|m| serde_json::json!({
              "serial_number": m.serial_number,
              "device_type": m.device_type,
              "asserted_hex": m.asserted_hex,
              "azimuth": m.azimuth
            })),
            "owner": req.update.as_ref().and_then(|u| u.owner.as_ref()).map(|o| serde_json::json!({
              "wallet": o.wallet.as_ref().map(|w| bs58::encode(&w.value).into_string()),
              "type": o.r#type
            }))
          }
        });

        info!(
          "🏠📱 MOBILE_HOTSPOT_UPDATE: {}",
          serde_json::to_string_pretty(&serialized).unwrap_or_else(|_| "Failed to serialize".to_string())
        );
      }
      HotspotUpdateRequest::Iot(req) => {
        // Serialize the protobuf message for logging
        let serialized = serde_json::json!({
          "event_type": "iot_hotspot_update",
          "table_name": change.table_name,
          "primary_key": change.primary_key,
          "change_column_value": change.change_column_value,
          "timestamp_ms": timestamp_ms,
          "signer": req.signer,
          "signature_length": req.signature.len(),
          "atomic_data": change.atomic_data,
          "protobuf_data": {
            "block_height": req.update.as_ref().map(|u| u.block_height),
            "block_time_seconds": req.update.as_ref().map(|u| u.block_time_seconds),
            "pub_key": req.update.as_ref().and_then(|u| u.pub_key.as_ref()).map(|pk| bs58::encode(&pk.value).into_string()),
            "asset": req.update.as_ref().and_then(|u| u.asset.as_ref()).map(|a| bs58::encode(&a.value).into_string()),
            "metadata": req.update.as_ref().and_then(|u| u.metadata.as_ref()).map(|m| serde_json::json!({
              "asserted_hex": m.asserted_hex,
              "elevation": m.elevation,
              "is_data_only": m.is_data_only
            })),
            "owner": req.update.as_ref().and_then(|u| u.owner.as_ref()).map(|o| serde_json::json!({
              "wallet": o.wallet.as_ref().map(|w| bs58::encode(&w.value).into_string()),
              "type": o.r#type
            }))
          }
        });

        info!(
          "🏠🔌 IOT_HOTSPOT_UPDATE: {}",
          serde_json::to_string_pretty(&serialized).unwrap_or_else(|_| "Failed to serialize".to_string())
        );
      }
    }

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
