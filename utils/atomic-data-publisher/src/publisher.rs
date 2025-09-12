use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

use crate::config::{IngestorConfig, PollingJob, ServiceConfig};
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
  service_config: ServiceConfig,
  ingestor_config: IngestorConfig,
  metrics: Arc<MetricsCollector>,
}

impl AtomicDataPublisher {
  pub async fn new(
    polling_jobs: Vec<PollingJob>,
    keypair: Keypair,
    service_config: ServiceConfig,
    ingestor_config: IngestorConfig,
    metrics: Arc<MetricsCollector>,
  ) -> Result<Self> {
    if service_config.dry_run {
      info!("Initializing AtomicDataPublisher in DRY RUN mode - skipping gRPC connection");

      let dummy_endpoint = Endpoint::from_static("http://localhost:1");
      let dummy_channel = dummy_endpoint.connect_lazy();
      let grpc_client = ChainRewardableEntitiesClient::new(dummy_channel);

      return Ok(Self {
        polling_jobs,
        keypair: Arc::new(keypair),
        grpc_client,
        service_config,
        ingestor_config,
        metrics,
      });
    }

    info!("Initializing AtomicDataPublisher with gRPC endpoint: {}", ingestor_config.endpoint);

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
      service_config,
      ingestor_config,
      metrics,
    })
  }

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

  async fn process_change(&self, change: &ChangeRecord) -> Result<(), AtomicDataError> {
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

    let hotspot_type_str = job_config
      .parameters
      .get("hotspot_type")
      .and_then(|v| v.as_str())
      .unwrap_or("mobile");

    let hotspot_request = build_hotspot_update_request(change, hotspot_type_str, &self.keypair)?;
    self.send_with_retries(hotspot_request).await?;

    Ok(())
  }

  async fn send_with_retries(&self, request: HotspotUpdateRequest) -> Result<(), AtomicDataError> {
    if self.service_config.dry_run {
      self.log_protobuf_message(&request).await?;
      return Ok(());
    }

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

  async fn log_protobuf_message(&self, request: &HotspotUpdateRequest) -> Result<(), AtomicDataError> {
    if self.service_config.dry_run_failure_rate > 0.0 {
      use rand::Rng;
      let mut rng = rand::thread_rng();
      let random_value: f32 = rng.gen();

      if random_value < self.service_config.dry_run_failure_rate {
        warn!("DRY RUN: Simulating failure for message (failure rate: {})", self.service_config.dry_run_failure_rate);
        return Err(AtomicDataError::NetworkError(
          "DRY RUN: Simulated network failure".to_string()
        ));
      }
    }
    match request {
      HotspotUpdateRequest::Mobile(mobile_req) => {
        info!(
          "DRY RUN: Would send MobileHotspotUpdateReqV1 - signer: {}, signature length: {}",
          mobile_req.signer,
          mobile_req.signature.len()
        );

        if let Some(update) = &mobile_req.update {
          info!(
            "DRY RUN: Mobile update details - block_height: {}, pub_key: {}, asset: {}",
            update.block_height,
            update.pub_key.as_ref().map(|pk| format!("{:?}", pk.value)).unwrap_or("None".to_string()),
            update.asset.as_ref().map(|asset| format!("{:?}", asset.value)).unwrap_or("None".to_string())
          );
        }

        debug!("DRY RUN: Full MobileHotspotUpdateReqV1: {:?}", mobile_req);
      }
      HotspotUpdateRequest::Iot(iot_req) => {
        info!(
          "DRY RUN: Would send IotHotspotUpdateReqV1 - signer: {}, signature length: {}",
          iot_req.signer,
          iot_req.signature.len()
        );

        if let Some(update) = &iot_req.update {
          info!(
            "DRY RUN: IoT update details - block_height: {}, pub_key: {}, asset: {}",
            update.block_height,
            update.pub_key.as_ref().map(|pk| format!("{:?}", pk.value)).unwrap_or("None".to_string()),
            update.asset.as_ref().map(|asset| format!("{:?}", asset.value)).unwrap_or("None".to_string())
          );
        }

        debug!("DRY RUN: Full IotHotspotUpdateReqV1: {:?}", iot_req);
      }
    }

    Ok(())
  }

  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    let public_key = self.keypair.public_key();
    debug!(
      "Publisher health check passed - keypair public key: {}",
      public_key
    );

    if self.service_config.dry_run {
      debug!("Publisher health check: DRY RUN mode enabled - skipping gRPC health check");
    } else {
      debug!("Publisher health check: gRPC client ready for production mode");
    }

    Ok(())
  }
}
