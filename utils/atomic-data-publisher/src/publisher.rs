use anyhow::Result;
use helium_crypto::Keypair;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

use crate::config::{IngestorConfig, PollingJob, ServiceConfig};
use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;
use crate::metrics::MetricsCollector;
use crate::protobuf::{build_entity_change_request, EntityChangeRequest};
use helium_proto::services::chain_rewardable_entities::{
  chain_rewardable_entities_client::ChainRewardableEntitiesClient, EntityOwnershipChangeRespV1,
  EntityRewardDestinationChangeRespV1, IotHotspotChangeRespV1, MobileHotspotChangeRespV1,
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

    let change_type = job_config
      .parameters
      .get("change_type")
      .and_then(|v| v.as_str())
      .or_else(|| {
        // Fallback to legacy hotspot_type parameter for backward compatibility
        job_config
          .parameters
          .get("hotspot_type")
          .and_then(|v| v.as_str())
          .map(|ht| match ht {
            "mobile" => "mobile_hotspot",
            "iot" => "iot_hotspot",
            _ => "mobile_hotspot",
          })
      })
      .unwrap_or("mobile_hotspot");

    let entity_request = build_entity_change_request(change, change_type, &self.keypair)?;
    self.send_with_retries(entity_request).await?;

    Ok(())
  }

  async fn send_with_retries(&self, request: EntityChangeRequest) -> Result<(), AtomicDataError> {
    if self.service_config.dry_run {
      self.log_protobuf_message(&request).await?;
      return Ok(());
    }

    let mut attempts = 0;
    let max_retries = self.ingestor_config.max_retries;

    loop {
      attempts += 1;

      match self.send_entity_change(request.clone()).await {
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

  async fn send_entity_change(&self, request: EntityChangeRequest) -> Result<(), AtomicDataError> {
    let mut client = self.grpc_client.clone();

    match request {
      EntityChangeRequest::MobileHotspot(mobile_req) => {
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

        let resp: MobileHotspotChangeRespV1 = response.into_inner();
        debug!("Mobile hotspot change accepted at timestamp: {}", resp.timestamp_ms);
      }
      EntityChangeRequest::IotHotspot(iot_req) => {
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

        let resp: IotHotspotChangeRespV1 = response.into_inner();
        debug!("IoT hotspot change accepted at timestamp: {}", resp.timestamp_ms);
      }
      EntityChangeRequest::EntityOwnership(ownership_req) => {
        let response = client
          .submit_entity_ownership_change(Request::new(ownership_req))
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
            AtomicDataError::NetworkError(format!("gRPC entity ownership request failed: {}", e))
          })?;

        let resp: EntityOwnershipChangeRespV1 = response.into_inner();
        debug!("Entity ownership change accepted at timestamp: {}", resp.timestamp_ms);
      }
      EntityChangeRequest::EntityRewardDestination(reward_req) => {
        let response = client
          .submit_entity_reward_destination_change(Request::new(reward_req))
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
            AtomicDataError::NetworkError(format!("gRPC entity reward destination request failed: {}", e))
          })?;

        let resp: EntityRewardDestinationChangeRespV1 = response.into_inner();
        debug!("Entity reward destination change accepted at timestamp: {}", resp.timestamp_ms);
      }
    }

    Ok(())
  }

  async fn log_protobuf_message(&self, request: &EntityChangeRequest) -> Result<(), AtomicDataError> {
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
      EntityChangeRequest::MobileHotspot(mobile_req) => {
        info!(
          "DRY RUN: Would send MobileHotspotChangeReqV1 - signer: {}, signature length: {}",
          mobile_req.signer,
          mobile_req.signature.len()
        );

        if let Some(change) = &mobile_req.change {
          info!(
            "DRY RUN: Mobile change details - block_height: {}, pub_key: {}, asset: {}, metadata: {:?}",
            change.block_height,
            change.pub_key.as_ref().map(|pk| format!("{:?}", pk.value)).unwrap_or("None".to_string()),
            change.asset.as_ref().map(|asset| format!("{:?}", asset.value)).unwrap_or("None".to_string()),
            change.metadata
          );
        }

        debug!("DRY RUN: Full MobileHotspotChangeReqV1: {:?}", mobile_req);
      }
      EntityChangeRequest::IotHotspot(iot_req) => {
        info!(
          "DRY RUN: Would send IotHotspotChangeReqV1 - signer: {}, signature length: {}",
          iot_req.signer,
          iot_req.signature.len()
        );

        if let Some(change) = &iot_req.change {
          info!(
            "DRY RUN: IoT change details - block_height: {}, pub_key: {}, asset: {}, metadata: {:?}",
            change.block_height,
            change.pub_key.as_ref().map(|pk| format!("{:?}", pk.value)).unwrap_or("None".to_string()),
            change.asset.as_ref().map(|asset| format!("{:?}", asset.value)).unwrap_or("None".to_string()),
            change.metadata
          );
        }

        debug!("DRY RUN: Full IotHotspotChangeReqV1: {:?}", iot_req);
      }
      EntityChangeRequest::EntityOwnership(ownership_req) => {
        info!(
          "DRY RUN: Would send EntityOwnershipChangeReqV1 - signer: {}, signature length: {}",
          ownership_req.signer,
          ownership_req.signature.len()
        );

        if let Some(change) = &ownership_req.change {
          info!(
            "DRY RUN: Entity ownership details - block_height: {}, entity_pub_key: {}, asset: {}, owner: {:?}",
            change.block_height,
            change.entity_pub_key.as_ref().map(|pk| format!("{:?}", pk.value)).unwrap_or("None".to_string()),
            change.asset.as_ref().map(|asset| format!("{:?}", asset.value)).unwrap_or("None".to_string()),
            change.owner
          );
        }

        debug!("DRY RUN: Full EntityOwnershipChangeReqV1: {:?}", ownership_req);
      }
      EntityChangeRequest::EntityRewardDestination(reward_req) => {
        info!(
          "DRY RUN: Would send EntityRewardDestinationChangeReqV1 - signer: {}, signature length: {}",
          reward_req.signer,
          reward_req.signature.len()
        );

        if let Some(change) = &reward_req.change {
          info!(
            "DRY RUN: Entity reward destination details - block_height: {}, entity_pub_key: {}, asset: {}, rewards_destination: {:?}",
            change.block_height,
            change.entity_pub_key.as_ref().map(|pk| format!("{:?}", pk.value)).unwrap_or("None".to_string()),
            change.asset.as_ref().map(|asset| format!("{:?}", asset.value)).unwrap_or("None".to_string()),
            change.rewards_destination
          );
        }

        debug!("DRY RUN: Full EntityRewardDestinationChangeReqV1: {:?}", reward_req);
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
