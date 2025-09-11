use anyhow::Result;
use bs58;
use chrono::{DateTime, Utc};
use helium_crypto::{Keypair, Sign};
use helium_proto::services::chain_rewardable_entities::{
  iot_hotspot_update_v1, mobile_hotspot_update_v1, split_recipient_info_v1, EntityOwnerInfo,
  EntityOwnerType, HeliumPubKey, IotHotspotMetadata, IotHotspotUpdateReqV1, IotHotspotUpdateV1,
  MobileHotspotDeviceType, MobileHotspotMetadata, MobileHotspotUpdateReqV1, MobileHotspotUpdateV1,
  RewardsSplitV1, SolanaPubKey, SplitRecipientInfoV1,
};
use prost::Message;
use serde_json::Value;
use tracing::{debug, warn};

use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;

/// Converts atomic data from database into protobuf messages
pub struct ProtobufBuilder;

impl ProtobufBuilder {
  /// Build a mobile hotspot update request from change record
  pub fn build_mobile_hotspot_update(
    change: &ChangeRecord,
    keypair: &Keypair,
  ) -> Result<MobileHotspotUpdateReqV1, AtomicDataError> {
    let atomic_data = change
      .atomic_data
      .as_array()
      .and_then(|arr| arr.first())
      .ok_or_else(|| {
        AtomicDataError::InvalidData("No atomic data found in change record".to_string())
      })?;

    debug!("Building mobile hotspot update from data: {}", atomic_data);
    debug!(
      "Available keys in data: {:?}",
      atomic_data
        .as_object()
        .map(|obj| obj.keys().collect::<Vec<_>>())
    );

    let block_height = Self::extract_u64(atomic_data, "block_height").unwrap_or(0);
    let block_time_seconds = Self::extract_u64(atomic_data, "block_time_seconds")
      .or_else(|| Self::extract_timestamp_as_seconds(atomic_data, "refreshed_at"))
      .unwrap_or_else(|| chrono::Utc::now().timestamp() as u64);

    let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let metadata = Self::build_mobile_hotspot_metadata(atomic_data)?;
    let owner = Self::build_entity_owner_info(atomic_data)?;

    // Build rewards destination
    let rewards_destination =
      if let Some(rewards_split) = Self::try_build_rewards_split(atomic_data)? {
        Some(mobile_hotspot_update_v1::RewardsDestination::RewardsSplitV1(rewards_split))
      } else if let Some(rewards_recipient) =
        Self::try_extract_solana_pub_key(atomic_data, "rewards_recipient")
      {
        Some(mobile_hotspot_update_v1::RewardsDestination::RewardsRecipient(rewards_recipient))
      } else {
        None
      };

    let update = MobileHotspotUpdateV1 {
      block_height,
      block_time_seconds,
      pub_key: Some(pub_key),
      asset: Some(asset),
      metadata: Some(metadata),
      owner: Some(owner),
      rewards_destination,
    };

    // Create the request without signature first
    let mut request = MobileHotspotUpdateReqV1 {
      update: Some(update),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

    // Sign the message
    let signature = Self::sign_message(&request, keypair)?;
    request.signature = signature;

    Ok(request)
  }

  /// Build an IoT hotspot update request from change record
  pub fn build_iot_hotspot_update(
    change: &ChangeRecord,
    keypair: &Keypair,
  ) -> Result<IotHotspotUpdateReqV1, AtomicDataError> {
    let atomic_data = change
      .atomic_data
      .as_array()
      .and_then(|arr| arr.first())
      .ok_or_else(|| {
        AtomicDataError::InvalidData("No atomic data found in change record".to_string())
      })?;

    debug!("Building IoT hotspot update from data: {}", atomic_data);

    let block_height = Self::extract_u64(atomic_data, "block_height").unwrap_or(0);
    let block_time_seconds = Self::extract_u64(atomic_data, "block_time_seconds")
      .or_else(|| Self::extract_timestamp_as_seconds(atomic_data, "refreshed_at"))
      .unwrap_or_else(|| chrono::Utc::now().timestamp() as u64);

    let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let metadata = Self::build_iot_hotspot_metadata(atomic_data)?;
    let owner = Self::build_entity_owner_info(atomic_data)?;

    // Build rewards destination
    let rewards_destination =
      if let Some(rewards_split) = Self::try_build_rewards_split(atomic_data)? {
        Some(iot_hotspot_update_v1::RewardsDestination::RewardsSplitV1(
          rewards_split,
        ))
      } else if let Some(rewards_recipient) =
        Self::try_extract_solana_pub_key(atomic_data, "rewards_recipient")
      {
        Some(iot_hotspot_update_v1::RewardsDestination::RewardsRecipient(
          rewards_recipient,
        ))
      } else {
        None
      };

    let update = IotHotspotUpdateV1 {
      block_height,
      block_time_seconds,
      pub_key: Some(pub_key),
      asset: Some(asset),
      metadata: Some(metadata),
      owner: Some(owner),
      rewards_destination,
    };

    // Create the request without signature first
    let mut request = IotHotspotUpdateReqV1 {
      update: Some(update),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

    // Sign the message
    let signature = Self::sign_message(&request, keypair)?;
    request.signature = signature;

    Ok(request)
  }

  fn build_mobile_hotspot_metadata(data: &Value) -> Result<MobileHotspotMetadata, AtomicDataError> {
    let serial_number = data
      .get("deployment_info")
      .and_then(|di| di.get("wifiInfoV0"))
      .and_then(|wifi| wifi.get("serial"))
      .and_then(|s| s.as_str())
      .map(|s| s.to_string())
      .or_else(|| Self::extract_string(data, "serial_number"))
      .unwrap_or_default();

    let device_type = Self::extract_string(data, "device_type")
      .and_then(|s| Self::parse_mobile_device_type(&s))
      .unwrap_or(MobileHotspotDeviceType::Unknown);

    let asserted_hex = Self::extract_string(data, "asserted_hex")
      .or_else(|| Self::extract_string(data, "location"))
      .or_else(|| Self::extract_u64(data, "location").map(|loc| format!("{:x}", loc)))
      .unwrap_or_default();

    let azimuth = data
      .get("deployment_info")
      .and_then(|di| di.get("wifiInfoV0"))
      .and_then(|wifi| wifi.get("azimuth"))
      .and_then(|a| a.as_u64())
      .map(|a| a as u32)
      .or_else(|| Self::extract_u32(data, "azimuth"))
      .unwrap_or(0);

    Ok(MobileHotspotMetadata {
      serial_number,
      device_type: device_type.into(),
      asserted_hex,
      azimuth,
    })
  }

  fn build_iot_hotspot_metadata(data: &Value) -> Result<IotHotspotMetadata, AtomicDataError> {
    let asserted_hex = Self::extract_string(data, "asserted_hex")
      .or_else(|| Self::extract_string(data, "location"))
      .or_else(|| {
        // Try to extract as numeric location and convert to hex
        Self::extract_u64(data, "location").map(|loc| format!("{:x}", loc))
      })
      .unwrap_or_default();

    let elevation = Self::extract_u32(data, "elevation").unwrap_or(0);
    let is_data_only = Self::extract_bool(data, "is_data_only").unwrap_or(false);

    Ok(IotHotspotMetadata {
      asserted_hex,
      elevation,
      is_data_only,
    })
  }

  fn build_entity_owner_info(data: &Value) -> Result<EntityOwnerInfo, AtomicDataError> {
    let wallet = Self::extract_solana_pub_key(data, "owner")?;
    let owner_type = Self::extract_string(data, "owner_type")
      .and_then(|s| Self::parse_entity_owner_type(&s))
      .unwrap_or(EntityOwnerType::DirectOwner);

    Ok(EntityOwnerInfo {
      wallet: Some(wallet),
      r#type: owner_type.into(),
    })
  }

  fn try_build_rewards_split(data: &Value) -> Result<Option<RewardsSplitV1>, AtomicDataError> {
    // Check if rewards split data exists and is not null
    if let Some(split_data) = data.get("rewards_split").filter(|v| !v.is_null()) {
      let pub_key = Self::extract_solana_pub_key(split_data, "pub_key")?;
      let schedule = Self::extract_string(split_data, "schedule").unwrap_or_default();
      let total_shares = Self::extract_u32(split_data, "total_shares").unwrap_or(100);

      let recipients =
        if let Some(recipients_array) = split_data.get("recipients").and_then(|v| v.as_array()) {
          recipients_array
            .iter()
            .filter_map(|recipient| Self::try_build_split_recipient(recipient).ok())
            .collect()
        } else {
          Vec::new()
        };

      Ok(Some(RewardsSplitV1 {
        pub_key: Some(pub_key),
        schedule,
        total_shares,
        recipients,
      }))
    } else {
      Ok(None)
    }
  }

  fn try_build_split_recipient(data: &Value) -> Result<SplitRecipientInfoV1, AtomicDataError> {
    let authority = Self::extract_solana_pub_key(data, "authority")?;
    let recipient = Self::extract_solana_pub_key(data, "recipient")?;

    let reward_amount = if let Some(fixed_amount) = Self::extract_u64(data, "fixed_amount") {
      Some(split_recipient_info_v1::RewardAmount::FixedAmount(
        fixed_amount,
      ))
    } else if let Some(shares) = Self::extract_u32(data, "shares") {
      Some(split_recipient_info_v1::RewardAmount::Shares(shares))
    } else {
      None
    };

    Ok(SplitRecipientInfoV1 {
      authority: Some(authority),
      recipient: Some(recipient),
      reward_amount,
    })
  }

  fn extract_helium_pub_key(data: &Value, key: &str) -> Result<HeliumPubKey, AtomicDataError> {
    debug!(
      "Looking for helium pub key '{}' in data. Available keys: {:?}",
      key,
      data.as_object().map(|obj| obj.keys().collect::<Vec<_>>())
    );
    debug!("Value at key '{}': {:?}", key, data.get(key));

    let key_str = Self::extract_string(data, key)
      .ok_or_else(|| AtomicDataError::InvalidData(format!("Missing helium pub key: {}", key)))?;

    let decoded = bs58::decode(&key_str).into_vec().map_err(|e| {
      AtomicDataError::InvalidData(format!(
        "Invalid base58 helium pub key {} (value: '{}'): {}",
        key, key_str, e
      ))
    })?;

    Ok(HeliumPubKey { value: decoded })
  }

  fn extract_solana_pub_key(data: &Value, key: &str) -> Result<SolanaPubKey, AtomicDataError> {
    debug!(
      "Looking for solana pub key '{}' in data. Available keys: {:?}",
      key,
      data.as_object().map(|obj| obj.keys().collect::<Vec<_>>())
    );
    debug!("Value at key '{}': {:?}", key, data.get(key));

    let key_str = Self::extract_string(data, key)
      .ok_or_else(|| AtomicDataError::InvalidData(format!("Missing solana pub key: {}", key)))?;

    let decoded = bs58::decode(&key_str).into_vec().map_err(|e| {
      AtomicDataError::InvalidData(format!("Invalid base58 solana pub key {}: {}", key, e))
    })?;

    Ok(SolanaPubKey { value: decoded })
  }

  fn try_extract_solana_pub_key(data: &Value, key: &str) -> Option<SolanaPubKey> {
    Self::extract_string(data, key)
      .and_then(|key_str| bs58::decode(&key_str).into_vec().ok())
      .map(|decoded| SolanaPubKey { value: decoded })
  }

  fn extract_string(data: &Value, key: &str) -> Option<String> {
    data.get(key)?.as_str().map(|s| s.to_string())
  }

  fn extract_u64(data: &Value, key: &str) -> Option<u64> {
    data
      .get(key)?
      .as_u64()
      .or_else(|| data.get(key)?.as_str()?.parse().ok())
  }

  fn extract_u32(data: &Value, key: &str) -> Option<u32> {
    data
      .get(key)?
      .as_u64()
      .map(|v| v as u32)
      .or_else(|| data.get(key)?.as_str()?.parse().ok())
  }

  fn extract_bool(data: &Value, key: &str) -> Option<bool> {
    data
      .get(key)?
      .as_bool()
      .or_else(|| data.get(key)?.as_str()?.parse().ok())
  }

  fn extract_timestamp_as_seconds(data: &Value, key: &str) -> Option<u64> {
    let timestamp_str = Self::extract_string(data, key)?;

    // Try parsing as RFC3339 timestamp
    if let Ok(dt) = DateTime::parse_from_rfc3339(&timestamp_str) {
      return Some(dt.timestamp() as u64);
    }

    // Try parsing as UTC timestamp
    if let Ok(dt) = timestamp_str.parse::<DateTime<Utc>>() {
      return Some(dt.timestamp() as u64);
    }

    // Try parsing as unix timestamp
    if let Ok(timestamp) = timestamp_str.parse::<u64>() {
      return Some(timestamp);
    }

    warn!("Failed to parse timestamp: {}", timestamp_str);
    None
  }

  fn parse_mobile_device_type(device_type_str: &str) -> Option<MobileHotspotDeviceType> {
    match device_type_str {
      "wifiIndoor" => Some(MobileHotspotDeviceType::WifiIndoor),
      "wifiOutdoor" => Some(MobileHotspotDeviceType::WifiOutdoor),
      "wifiDataOnly" => Some(MobileHotspotDeviceType::WifiDataOnly),
      "cbrs" => Some(MobileHotspotDeviceType::Cbrs),
      _ => {
        warn!("Unknown mobile device type: {}", device_type_str);
        None
      }
    }
  }

  fn parse_entity_owner_type(owner_type_str: &str) -> Option<EntityOwnerType> {
    match owner_type_str {
      "direct_owner" => Some(EntityOwnerType::DirectOwner),
      "welcome_pack_owner" => Some(EntityOwnerType::WelcomePackOwner),
      _ => {
        warn!("Unknown entity owner type: {}", owner_type_str);
        None
      }
    }
  }

  /// Sign a protobuf message using Helium crypto
  fn sign_message<T>(msg: &T, keypair: &Keypair) -> Result<Vec<u8>, AtomicDataError>
  where
    T: Message + Clone,
  {
    // Clone the message and clear the signature field
    let unsigned_msg = msg.clone();
    let mut buf = Vec::new();
    unsigned_msg.encode(&mut buf).map_err(|e| {
      AtomicDataError::SerializationError(format!("Failed to encode message: {}", e))
    })?;

    // Sign the encoded message
    let signature = keypair
      .sign(&buf)
      .map_err(|e| AtomicDataError::InvalidData(format!("Failed to sign message: {}", e)))?;

    Ok(signature.to_vec())
  }
}

/// Enum to hold either mobile or IoT hotspot update requests for gRPC
#[derive(Debug, Clone)]
pub enum HotspotUpdateRequest {
  Mobile(MobileHotspotUpdateReqV1),
  Iot(IotHotspotUpdateReqV1),
}

pub fn build_hotspot_update_request(
  change: &ChangeRecord,
  hotspot_type: &str,
  keypair: &Keypair,
) -> Result<HotspotUpdateRequest, AtomicDataError> {
  match hotspot_type {
    "mobile" => {
      let req = ProtobufBuilder::build_mobile_hotspot_update(change, keypair)?;
      Ok(HotspotUpdateRequest::Mobile(req))
    }
    "iot" => {
      let req = ProtobufBuilder::build_iot_hotspot_update(change, keypair)?;
      Ok(HotspotUpdateRequest::Iot(req))
    }
    _ => {
      // Default to mobile for unknown types
      let req = ProtobufBuilder::build_mobile_hotspot_update(change, keypair)?;
      Ok(HotspotUpdateRequest::Mobile(req))
    }
  }
}
