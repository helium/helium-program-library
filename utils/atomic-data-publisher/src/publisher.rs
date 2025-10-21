use std::sync::Arc;
use std::error::Error;

use anyhow::Result;
use helium_crypto::{Keypair, Sign};
use helium_proto::services::chain_rewardable_entities::{
  chain_rewardable_entities_client::ChainRewardableEntitiesClient, EntityOwnershipChangeRespV1,
  EntityRewardDestinationChangeRespV1, IotHotspotChangeRespV1, MobileHotspotChangeRespV1,
};
use tonic::transport::Channel;
use tracing::{debug, error, info, warn};

use crate::{
  config::{IngestorConfig, PollingJob, ServiceConfig},
  database::ChangeRecord,
  errors::AtomicDataError,
  metrics,
  protobuf::{build_entity_change_requests, EntityChangeRequest},
};

#[derive(Clone)]
pub struct AtomicDataPublisher {
  polling_jobs: Vec<PollingJob>,
  keypair: Arc<Keypair>,
  client: Option<ChainRewardableEntitiesClient<Channel>>,
  service_config: ServiceConfig,
  ingestor_config: IngestorConfig,
}

impl std::fmt::Debug for AtomicDataPublisher {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("AtomicDataPublisher")
      .field("polling_jobs", &self.polling_jobs)
      .field("client", &self.client.as_ref().map(|_| "ChainRewardableEntitiesClient { .. }"))
      .field("service_config", &self.service_config)
      .field("ingestor_config", &self.ingestor_config)
      .finish()
  }
}

impl AtomicDataPublisher {
  pub async fn new(
    polling_jobs: Vec<PollingJob>,
    keypair: Keypair,
    service_config: ServiceConfig,
    ingestor_config: IngestorConfig,
  ) -> Result<Self> {
    let client = if service_config.dry_run {
      info!("Initializing AtomicDataPublisher in DRY RUN mode - no gRPC client configured");
      None
    } else {
      info!(
        "Initializing AtomicDataPublisher with gRPC endpoint: {}",
        ingestor_config.endpoint
      );
      let client = ChainRewardableEntitiesClient::connect(ingestor_config.endpoint.clone()).await?;
      info!("gRPC client connected successfully");
      Some(client)
    };

    Ok(Self {
      polling_jobs,
      keypair: Arc::new(keypair),
      client,
      service_config,
      ingestor_config,
    })
  }

  /// Prepare change records for publishing by building protobuf requests
  pub async fn prepare_changes_batch(
    &self,
    change_record: &ChangeRecord,
  ) -> Result<Vec<EntityChangeRequest>, AtomicDataError> {
    let job_config = self
      .polling_jobs
      .iter()
      .find(|j| j.name == change_record.job_name)
      .ok_or_else(|| {
        AtomicDataError::InvalidData(format!(
          "No configuration found for job: {}",
          change_record.job_name
        ))
      })?;

    let change_type = job_config
      .parameters
      .get("change_type")
      .and_then(|v| v.as_str())
      .ok_or_else(|| {
        AtomicDataError::InvalidData(format!(
          "No change type found for job: {}",
          change_record.job_name
        ))
      })?;

    build_entity_change_requests(change_record, change_type, &self.keypair, false)
  }

  /// Publish a single change request with retries
  pub async fn publish_change_request(
    &self,
    request: EntityChangeRequest,
  ) -> Result<(), AtomicDataError> {
    if self.service_config.dry_run {
      self.log_protobuf_message(&request).await?;
      tokio::task::yield_now().await;
      return Ok(());
    }

    let mut client = self.client.as_ref()
      .ok_or_else(|| AtomicDataError::NetworkError("No client configured".to_string()))?
      .clone();

    let mut attempts = 0;
    let max_retries = self.ingestor_config.max_retries;

    loop {
      attempts += 1;
      debug!("Publishing entity change request (attempt {}/{})", attempts, max_retries + 1);

      match self.publish_entity_change(&mut client, request.clone()).await {
        Ok(_) => {
          debug!(
            "Successfully published entity change request on attempt {}",
            attempts
          );
          return Ok(());
        }
        Err(e) => {
          if attempts <= max_retries {
            metrics::increment_ingestor_retry_attempts();
            warn!(
              "Failed to publish entity change request (attempt {}/{}): {}. Retrying...",
              attempts, max_retries, e
            );
            tokio::time::sleep(std::time::Duration::from_secs(
              self.ingestor_config.retry_delay_seconds,
            ))
            .await;
          } else {
            metrics::increment_ingestor_publish_failures();
            error!(
              "Failed to publish entity change request after {} attempts: {}",
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

  async fn publish_entity_change(
    &self,
    client: &mut ChainRewardableEntitiesClient<Channel>,
    request: EntityChangeRequest
  ) -> Result<(), AtomicDataError> {

    match request {
      EntityChangeRequest::MobileHotspot(mobile_req) => {
        debug!("Sending mobile hotspot change request to {}", self.ingestor_config.endpoint);
        let response = client
          .submit_mobile_hotspot_change(mobile_req)
          .await
          .map_err(|e| {
            // Log detailed error information
            error!("gRPC error - code: {:?}, message: {}", e.code(), e.message());
            if let Some(source) = e.source() {
              error!("gRPC error source: {}", source);
            }
            debug!("Full gRPC error: {:?}", e);

            // Categorize the error type for better metrics
            match e.code() {
              tonic::Code::Unavailable | tonic::Code::DeadlineExceeded => {
                metrics::increment_ingestor_connection_failures();
                error!("Connection failure to ingestor - check network/TLS");
              }
              _ => {
                // Other gRPC errors (auth, invalid request, etc.)
                error!("Non-connection gRPC error: {}", e.code());
              }
            }
            AtomicDataError::NetworkError(format!(
              "gRPC mobile hotspot request failed: status: '{}', message: \"{}\"",
              e.code(),
              e.message()
            ))
          })?;

        let resp: MobileHotspotChangeRespV1 = response.into_inner();
        debug!(
          "Mobile hotspot change accepted at timestamp: {}",
          resp.timestamp_ms
        );
      }
      EntityChangeRequest::IotHotspot(iot_req) => {
        let response = client
          .submit_iot_hotspot_change(iot_req)
          .await
          .map_err(|e| {
            // Categorize the error type for better metrics
            match e.code() {
              tonic::Code::Unavailable | tonic::Code::DeadlineExceeded => {
                metrics::increment_ingestor_connection_failures();
              }
              _ => {
                // Other gRPC errors (auth, invalid request, etc.)
              }
            }
            AtomicDataError::NetworkError(format!(
              "gRPC IoT hotspot request failed: status: '{}', message: \"{}\"",
              e.code(),
              e.message()
            ))
          })?;

        let resp: IotHotspotChangeRespV1 = response.into_inner();
        debug!(
          "IoT hotspot change accepted at timestamp: {}",
          resp.timestamp_ms
        );
      }
      EntityChangeRequest::EntityOwnership(ownership_req) => {
        let response = client
          .submit_entity_ownership_change(ownership_req)
          .await
          .map_err(|e| {
            // Categorize the error type for better metrics
            match e.code() {
              tonic::Code::Unavailable | tonic::Code::DeadlineExceeded => {
                metrics::increment_ingestor_connection_failures();
              }
              _ => {
                // Other gRPC errors (auth, invalid request, etc.)
              }
            }
            AtomicDataError::NetworkError(format!(
              "gRPC entity ownership request failed: status: '{}', message: \"{}\"",
              e.code(),
              e.message()
            ))
          })?;

        let resp: EntityOwnershipChangeRespV1 = response.into_inner();
        debug!(
          "Entity ownership change accepted at timestamp: {}",
          resp.timestamp_ms
        );
      }
      EntityChangeRequest::EntityRewardDestination(reward_req) => {
        let response = client
          .submit_entity_reward_destination_change(reward_req)
          .await
          .map_err(|e| {
            // Categorize the error type for better metrics
            match e.code() {
              tonic::Code::Unavailable | tonic::Code::DeadlineExceeded => {
                metrics::increment_ingestor_connection_failures();
              }
              _ => {
                // Other gRPC errors (auth, invalid request, etc.)
              }
            }
            AtomicDataError::NetworkError(format!(
              "gRPC entity reward destination request failed: status: '{}', message: \"{}\"",
              e.code(),
              e.message()
            ))
          })?;

        let resp: EntityRewardDestinationChangeRespV1 = response.into_inner();
        debug!(
          "Entity reward destination change accepted at timestamp: {}",
          resp.timestamp_ms
        );
      }
    }

    Ok(())
  }

  async fn log_protobuf_message(
    &self,
    request: &EntityChangeRequest,
  ) -> Result<(), AtomicDataError> {
    if self.service_config.dry_run_failure_rate > 0.0 {
      use rand::Rng;
      let mut rng = rand::thread_rng();
      let random_value: f32 = rng.gen();

      if random_value < self.service_config.dry_run_failure_rate {
        warn!(
          "DRY RUN: Simulating failure (failure rate: {})",
          self.service_config.dry_run_failure_rate
        );
        return Err(AtomicDataError::NetworkError(
          "DRY RUN: Simulated network failure".to_string(),
        ));
      }
    }

    // Log detailed information only at debug level
    match request {
      EntityChangeRequest::MobileHotspot(mobile_req) => {
        debug!("DRY RUN: Mobile hotspot change: {:?}", mobile_req);
      }
      EntityChangeRequest::IotHotspot(iot_req) => {
        debug!("DRY RUN: IoT hotspot change: {:?}", iot_req);
      }
      EntityChangeRequest::EntityOwnership(ownership_req) => {
        debug!("DRY RUN: Entity ownership change: {:?}", ownership_req);
      }
      EntityChangeRequest::EntityRewardDestination(reward_req) => {
        debug!("DRY RUN: Entity reward destination change: {:?}", reward_req);
      }
    }

    Ok(())
  }

  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    let public_key = self.keypair.public_key();
    debug!(
      "Publisher health check - keypair public key: {}",
      public_key
    );

    // Verify keypair is valid and can sign
    let test_message = b"health_check_test";
    if self.keypair.sign(test_message).is_err() {
      return Err(AtomicDataError::NetworkError(
        "Keypair signing failed".to_string(),
      ));
    }

    if self.service_config.dry_run {
      debug!("Publisher health check: DRY RUN mode enabled - skipping gRPC health check");
    } else {
      // In production mode, verify the client is available
      debug!("Publisher health check: verifying gRPC client");

      if self.client.is_none() {
        return Err(AtomicDataError::NetworkError(
          "No gRPC client configured".to_string()
        ));
      }

      debug!("Publisher health check: gRPC client available");
    }

    debug!("Publisher health check passed");
    Ok(())
  }
}
