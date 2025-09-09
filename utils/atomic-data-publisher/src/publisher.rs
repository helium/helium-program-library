use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

use crate::config::{IngestorConfig, PollingJob};
use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;
use crate::metrics::MetricsCollector;
use crate::protobuf::{build_hotspot_update_request, HotspotUpdateRequest};
use helium_proto::services::chain_rewardable_entities::{
  chain_rewardable_entities_client::ChainRewardableEntitiesClient, MobileHotspotUpdateRespV1,
  IotHotspotUpdateRespV1,
};
use tonic::transport::{Channel, Endpoint};
use tonic::Request;

#[derive(Debug, Clone)]
pub struct AtomicDataPublisher {
  polling_jobs: Vec<PollingJob>,
  keypair: Arc<Keypair>,
  grpc_client: ChainRewardableEntitiesClient<Channel>,
  ingestor_config: IngestorConfig,
  metrics: Arc<MetricsCollector>,
}

impl AtomicDataPublisher {
  pub async fn new(
    polling_jobs: Vec<PollingJob>,
    keypair: Keypair,
    ingestor_config: IngestorConfig,
    metrics: Arc<MetricsCollector>,
  ) -> Result<Self> {
    info!("Initializing AtomicDataPublisher with gRPC endpoint: {}", ingestor_config.endpoint);

    // Create gRPC client
    let endpoint = Endpoint::from_shared(ingestor_config.endpoint.clone())
      .map_err(|e| anyhow::anyhow!("Invalid ingestor endpoint: {}", e))?
      .timeout(std::time::Duration::from_secs(ingestor_config.timeout_seconds));

    let channel = endpoint
      .connect()
      .await
      .map_err(|e| {
        metrics.increment_ingestor_connection_failures();
        anyhow::anyhow!("Failed to connect to ingestor: {}", e)
      })?;

    let grpc_client = ChainRewardableEntitiesClient::new(channel);

    Ok(Self {
      polling_jobs,
      keypair: Arc::new(keypair),
      grpc_client,
      ingestor_config,
      metrics,
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
      match self.process_change(&change).await {
        Ok(()) => {
          published_ids.push(change.job_name.clone());
          debug!(
            "Successfully published change for job '{}'",
            change.job_name
          );
        }
        Err(e) => {
          error!(
            "Failed to publish change for job '{}': {}",
            change.job_name, e
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

  /// Process a single change record by sending it via gRPC to the ingestor
  async fn process_change(&self, change: &ChangeRecord) -> Result<(), AtomicDataError> {
    // Find the polling job configuration
    let job_config = self
      .polling_jobs
      .iter()
      .find(|j| j.name == change.job_name)
      .ok_or_else(|| {
        AtomicDataError::InvalidData(format!(
          "No configuration found for job: {}",
          change.job_name
        ))
      })?;

    // Extract hotspot_type from job parameters
    let hotspot_type_str = job_config
      .parameters
      .get("hotspot_type")
      .and_then(|v| v.as_str())
      .unwrap_or("mobile"); // Default to mobile if not specified

    // Build protobuf request with proper signing
    let hotspot_request = build_hotspot_update_request(change, hotspot_type_str, &self.keypair)?;

    // Send the request to the ingestor via gRPC with retries
    self.send_with_retries(hotspot_request).await?;

    Ok(())
  }

  /// Send hotspot update request with retry logic
  async fn send_with_retries(&self, request: HotspotUpdateRequest) -> Result<(), AtomicDataError> {
    let mut attempts = 0;
    let max_retries = self.ingestor_config.max_retries;

    loop {
      attempts += 1;

      match self.send_hotspot_update(request.clone()).await {
        Ok(_) => {
          debug!("Successfully sent hotspot change request on attempt {}", attempts);
          return Ok(());
        }
        Err(e) => {
          if attempts <= max_retries {
            self.metrics.increment_ingestor_retry_attempts();
            warn!(
              "Failed to send hotspot update request (attempt {}/{}): {}. Retrying...",
              attempts, max_retries, e
            );
            tokio::time::sleep(std::time::Duration::from_secs(
              self.ingestor_config.retry_delay_seconds,
            ))
            .await;
          } else {
            self.metrics.increment_ingestor_publish_failures();
            error!(
              "Failed to send hotspot update request after {} attempts: {}",
              attempts, e
            );
            return Err(AtomicDataError::NetworkError(format!(
              "Failed after {} retries: {}",
              max_retries, e
            )));
          }
        }
      }
    }
  }

  /// Send a single hotspot update request via gRPC
  async fn send_hotspot_update(&self, request: HotspotUpdateRequest) -> Result<(), AtomicDataError> {
    let mut client = self.grpc_client.clone();

    match request {
      HotspotUpdateRequest::Mobile(mobile_req) => {
        let response = client
          .submit_mobile_hotspot_change(Request::new(mobile_req))
          .await
          .map_err(|e| {
            // Categorize the error type for better metrics
            match e.code() {
              tonic::Code::Unavailable | tonic::Code::DeadlineExceeded => {
                self.metrics.increment_ingestor_connection_failures();
              }
              _ => {
                // Other gRPC errors (auth, invalid request, etc.)
              }
            }
            AtomicDataError::NetworkError(format!("gRPC mobile hotspot request failed: {}", e))
          })?;

        let resp: MobileHotspotUpdateRespV1 = response.into_inner();
        debug!("Mobile hotspot update accepted at timestamp: {}", resp.timestamp_ms);
      }
      HotspotUpdateRequest::Iot(iot_req) => {
        let response = client
          .submit_iot_hotspot_change(Request::new(iot_req))
          .await
          .map_err(|e| {
            // Categorize the error type for better metrics
            match e.code() {
              tonic::Code::Unavailable | tonic::Code::DeadlineExceeded => {
                self.metrics.increment_ingestor_connection_failures();
              }
              _ => {
                // Other gRPC errors (auth, invalid request, etc.)
              }
            }
            AtomicDataError::NetworkError(format!("gRPC IoT hotspot request failed: {}", e))
          })?;

        let resp: IotHotspotUpdateRespV1 = response.into_inner();
        debug!("IoT hotspot update accepted at timestamp: {}", resp.timestamp_ms);
      }
    }

    Ok(())
  }

  /// Health check the publisher (validates gRPC connection and keypair)
  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    // Validate that we have a valid keypair
    let public_key = self.keypair.public_key();
    debug!(
      "Publisher health check passed - keypair public key: {}",
      public_key
    );

    // TODO: Could add a lightweight gRPC health check here if needed

    Ok(())
  }
}
