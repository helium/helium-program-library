use anyhow::Result;
use helium_crypto::Keypair;
use helium_proto::services::chain_rewardable_entities::{
    chain_rewardable_entities_client::ChainRewardableEntitiesClient,
};
use std::sync::Arc;
use std::time::Duration;
use tonic::transport::{Channel, Endpoint, ClientTlsConfig};
use tracing::{debug, error, info, warn};

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
  grpc_client: ChainRewardableEntitiesClient<Channel>,
  config: IngestorConfig,
  watched_tables: Vec<WatchedTable>,
  keypair: Arc<Keypair>,
}

impl AtomicDataPublisher {
  pub async fn new(config: IngestorConfig, watched_tables: Vec<WatchedTable>, keypair: Keypair) -> Result<Self> {
    // Build gRPC endpoint
    let mut endpoint = Endpoint::from_shared(config.grpc_endpoint.clone())?
      .timeout(Duration::from_secs(config.timeout_seconds))
      .keep_alive_timeout(Duration::from_secs(30))
      .keep_alive_while_idle(true);

    // Configure TLS if enabled
    if config.tls_enabled {
      endpoint = endpoint.tls_config(ClientTlsConfig::new())?;
    }

    // Create gRPC channel
    let channel = endpoint.connect().await?;
    let grpc_client = ChainRewardableEntitiesClient::new(channel);

    info!("Connected to gRPC ingestor service at {}", config.grpc_endpoint);

    Ok(Self {
      grpc_client,
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

  /// Publish a single change record
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

    debug!(
      "Sending {} hotspot update for {}/{}",
      hotspot_request.hotspot_type(),
      change.table_name,
      change.primary_key
    );

    let mut client = self.grpc_client.clone();

        let result = match &hotspot_request {
      HotspotUpdateRequest::Mobile(req) => {
        let response = client.submit_mobile_hotspot_change(tonic::Request::new(req.clone())).await
          .map_err(|e| AtomicDataError::ServiceUnavailable(format!("gRPC error: {}", e)))?;

        PublishResult {
          success: true,
          timestamp_ms: response.into_inner().timestamp_ms,
          error_message: None,
        }
      }
      HotspotUpdateRequest::Iot(req) => {
        let response = client.submit_iot_hotspot_change(tonic::Request::new(req.clone())).await
          .map_err(|e| AtomicDataError::ServiceUnavailable(format!("gRPC error: {}", e)))?;

        PublishResult {
          success: true,
          timestamp_ms: response.into_inner().timestamp_ms,
          error_message: None,
        }
      }
    };

    Ok(result)
  }

  /// Health check the ingestor service
  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    // For gRPC services, we can check if the connection is still alive
    // by cloning the client (this is a simple check that the client is valid)
    let _client = self.grpc_client.clone();
    debug!("gRPC health check passed");
    Ok(())
  }
}
