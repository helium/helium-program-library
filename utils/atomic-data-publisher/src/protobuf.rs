use anyhow::Result;
use bs58;
use chrono::{DateTime, Utc};
use helium_crypto::{Keypair, Sign};
use helium_proto::services::chain_rewardable_entities::{
  entity_owner_info, entity_owner_type, helium_pub_key, iot_hotspot_metadata,
  iot_hotspot_update_v1, mobile_hotspot_device_type, mobile_hotspot_metadata,
  mobile_hotspot_update_v1, rewards_split_v1, solana_pub_key, split_recipient_info_v1,
  IotHotspotChangeReqV1, MobileHotspotChangeReqV1,
};
use prost::Message;
use serde_json::Value;
use std::collections::HashMap;
use tracing::{debug, error, warn};

use crate::config::HotspotType;
use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;

/// Converts atomic data from database into protobuf messages
pub struct ProtobufBuilder;

impl ProtobufBuilder {
  /// Build a mobile hotspot update request from change record
  pub fn build_mobile_hotspot_update(
    change: &ChangeRecord,
    keypair: &Keypair,
  ) -> Result<MobileHotspotChangeReqV1, AtomicDataError> {
    let atomic_data = change
      .atomic_data
      .as_array()
      .and_then(|arr| arr.first())
      .ok_or_else(|| {
        AtomicDataError::InvalidData("No atomic data found in change record".to_string())
      })?;

    let update = Self::build_mobile_hotspot_update_v1(atomic_data)?;

    // Create the request without signature first
    let mut request = MobileHotspotChangeReqV1 {
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
  ) -> Result<IotHotspotChangeReqV1, AtomicDataError> {
    let atomic_data = change
      .atomic_data
      .as_array()
      .and_then(|arr| arr.first())
      .ok_or_else(|| {
        AtomicDataError::InvalidData("No atomic data found in change record".to_string())
      })?;

    let update = Self::build_iot_hotspot_update_v1(atomic_data)?;

    // Create the request without signature first
    let mut request = IotHotspotChangeReqV1 {
      update: Some(update),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

    // Sign the message
    let signature = Self::sign_message(&request, keypair)?;
    request.signature = signature;

    Ok(request)
  }

  fn build_mobile_hotspot_update_v1(
    data: &Value,
  ) -> Result<mobile_hotspot_update_v1, AtomicDataError> {
    debug!("Building mobile hotspot update from data: {}", data);

    let block_height = Self::extract_u64(data, "block_height").unwrap_or(0);
    let block_time_seconds = Self::extract_u64(data, "block_time_seconds")
      .or_else(|| Self::extract_timestamp_as_seconds(data, "updated_at"))
      .unwrap_or_else(|| chrono::Utc::now().timestamp() as u64);

    let pub_key = Self::extract_helium_pub_key(data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(data, "asset")?;
    let metadata = Self::build_mobile_hotspot_metadata(data)?;
    let owner = Self::build_entity_owner_info(data)?;

    // Build rewards destination
    let rewards_destination = if let Some(rewards_split) = Self::try_build_rewards_split(data)? {
      Some(mobile_hotspot_update_v1::RewardsDestination::RewardsSplitV1(rewards_split))
    } else if let Some(rewards_recipient) =
      Self::try_extract_solana_pub_key(data, "rewards_recipient")
    {
      Some(mobile_hotspot_update_v1::RewardsDestination::RewardsRecipient(rewards_recipient))
    } else {
      warn!("No rewards destination found in data");
      None
    };

    Ok(mobile_hotspot_update_v1 {
      block_height,
      block_time_seconds,
      pub_key: Some(pub_key),
      asset: Some(asset),
      metadata: Some(metadata),
      owner: Some(owner),
      rewards_destination,
    })
  }

  fn build_iot_hotspot_update_v1(data: &Value) -> Result<iot_hotspot_update_v1, AtomicDataError> {
    debug!("Building IoT hotspot update from data: {}", data);

    let block_height = Self::extract_u64(data, "block_height").unwrap_or(0);
    let block_time_seconds = Self::extract_u64(data, "block_time_seconds")
      .or_else(|| Self::extract_timestamp_as_seconds(data, "updated_at"))
      .unwrap_or_else(|| chrono::Utc::now().timestamp() as u64);

    let pub_key = Self::extract_helium_pub_key(data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(data, "asset")?;
    let metadata = Self::build_iot_hotspot_metadata(data)?;
    let owner = Self::build_entity_owner_info(data)?;

    // Build rewards destination
    let rewards_destination = if let Some(rewards_split) = Self::try_build_rewards_split(data)? {
      Some(iot_hotspot_update_v1::RewardsDestination::RewardsSplitV1(
        rewards_split,
      ))
    } else if let Some(rewards_recipient) =
      Self::try_extract_solana_pub_key(data, "rewards_recipient")
    {
      Some(iot_hotspot_update_v1::RewardsDestination::RewardsRecipient(
        rewards_recipient,
      ))
    } else {
      warn!("No rewards destination found in data");
      None
    };

    Ok(iot_hotspot_update_v1 {
      block_height,
      block_time_seconds,
      pub_key: Some(pub_key),
      asset: Some(asset),
      metadata: Some(metadata),
      owner: Some(owner),
      rewards_destination,
    })
  }

  fn build_mobile_hotspot_metadata(
    data: &Value,
  ) -> Result<mobile_hotspot_metadata, AtomicDataError> {
    let serial_number = Self::extract_string(data, "serial_number").unwrap_or_default();

    let device_type = Self::extract_string(data, "device_type")
      .and_then(|s| Self::parse_mobile_device_type(&s))
      .unwrap_or(mobile_hotspot_device_type::MobileHotspotDeviceTypeUnknown);

    let asserted_hex = Self::extract_string(data, "asserted_hex")
      .or_else(|| Self::extract_string(data, "location"))
      .unwrap_or_default();

    let azimuth = Self::extract_u32(data, "azimuth").unwrap_or(0);

    Ok(mobile_hotspot_metadata {
      serial_number,
      device_type: device_type.into(),
      asserted_hex,
      azimuth,
    })
  }

  fn build_iot_hotspot_metadata(data: &Value) -> Result<iot_hotspot_metadata, AtomicDataError> {
    let asserted_hex = Self::extract_string(data, "asserted_hex")
      .or_else(|| Self::extract_string(data, "location"))
      .unwrap_or_default();

    let elevation = Self::extract_u32(data, "elevation").unwrap_or(0);
    let is_data_only = Self::extract_bool(data, "is_data_only").unwrap_or(false);

    Ok(iot_hotspot_metadata {
      asserted_hex,
      elevation,
      is_data_only,
    })
  }

  fn build_entity_owner_info(data: &Value) -> Result<entity_owner_info, AtomicDataError> {
    let wallet = Self::extract_solana_pub_key(data, "owner")?;

    let owner_type = Self::extract_string(data, "owner_type")
      .and_then(|s| Self::parse_entity_owner_type(&s))
      .unwrap_or(entity_owner_type::EntityOwnerTypeDirectOwner);

    Ok(entity_owner_info {
      wallet: Some(wallet),
      r#type: owner_type.into(),
    })
  }

  fn try_build_rewards_split(data: &Value) -> Result<Option<rewards_split_v1>, AtomicDataError> {
    // Check if rewards split data exists
    if let Some(split_data) = data.get("rewards_split") {
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

      Ok(Some(rewards_split_v1 {
        pub_key: Some(pub_key),
        schedule,
        total_shares,
        recipients,
      }))
    } else {
      Ok(None)
    }
  }

  fn try_build_split_recipient(data: &Value) -> Result<split_recipient_info_v1, AtomicDataError> {
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

    Ok(split_recipient_info_v1 {
      authority: Some(authority),
      recipient: Some(recipient),
      reward_amount,
    })
  }

  fn extract_helium_pub_key(data: &Value, key: &str) -> Result<helium_pub_key, AtomicDataError> {
    let key_str = Self::extract_string(data, key)
      .ok_or_else(|| AtomicDataError::InvalidData(format!("Missing helium pub key: {}", key)))?;

    let decoded = bs58::decode(&key_str).into_vec().map_err(|e| {
      AtomicDataError::InvalidData(format!("Invalid base58 helium pub key {}: {}", key, e))
    })?;

    Ok(helium_pub_key { value: decoded })
  }

  fn extract_solana_pub_key(data: &Value, key: &str) -> Result<solana_pub_key, AtomicDataError> {
    let key_str = Self::extract_string(data, key)
      .ok_or_else(|| AtomicDataError::InvalidData(format!("Missing solana pub key: {}", key)))?;

    let decoded = bs58::decode(&key_str).into_vec().map_err(|e| {
      AtomicDataError::InvalidData(format!("Invalid base58 solana pub key {}: {}", key, e))
    })?;

    Ok(solana_pub_key { value: decoded })
  }

  fn try_extract_solana_pub_key(data: &Value, key: &str) -> Option<solana_pub_key> {
    Self::extract_string(data, key)
      .and_then(|key_str| bs58::decode(&key_str).into_vec().ok())
      .map(|decoded| solana_pub_key { value: decoded })
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

  fn parse_mobile_device_type(device_type_str: &str) -> Option<mobile_hotspot_device_type> {
    match device_type_str.to_lowercase().as_str() {
      "cbrs" => Some(mobile_hotspot_device_type::MobileHotspotDeviceTypeCbrs),
      "wifi_indoor" | "wifi-indoor" => {
        Some(mobile_hotspot_device_type::MobileHotspotDeviceTypeWifiIndoor)
      }
      "wifi_outdoor" | "wifi-outdoor" => {
        Some(mobile_hotspot_device_type::MobileHotspotDeviceTypeWifiOutdoor)
      }
      "wifi_data_only" | "wifi-data-only" => {
        Some(mobile_hotspot_device_type::MobileHotspotDeviceTypeWifiDataOnly)
      }
      _ => {
        warn!("Unknown mobile device type: {}", device_type_str);
        None
      }
    }
  }

  fn parse_entity_owner_type(owner_type_str: &str) -> Option<entity_owner_type> {
    match owner_type_str.to_lowercase().as_str() {
      "direct_owner" | "direct-owner" => Some(entity_owner_type::EntityOwnerTypeDirectOwner),
      "welcome_pack_owner" | "welcome-pack-owner" => {
        Some(entity_owner_type::EntityOwnerTypeWelcomePackOwner)
      }
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
    let mut unsigned_msg = msg.clone();
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

/// Determine which protobuf message to build based on hotspot type
pub fn build_hotspot_update_request(
  change: &ChangeRecord,
  hotspot_type: &HotspotType,
  keypair: &Keypair,
) -> Result<HotspotUpdateRequest, AtomicDataError> {
  match hotspot_type {
    HotspotType::Mobile => {
      let req = ProtobufBuilder::build_mobile_hotspot_update(change, keypair)?;
      Ok(HotspotUpdateRequest::Mobile(req))
    }
    HotspotType::Iot => {
      let req = ProtobufBuilder::build_iot_hotspot_update(change, keypair)?;
      Ok(HotspotUpdateRequest::Iot(req))
    }
  }
}

/// Enum to hold either mobile or IoT hotspot update requests
#[derive(Debug, Clone)]
pub enum HotspotUpdateRequest {
  Mobile(MobileHotspotChangeReqV1),
  Iot(IotHotspotChangeReqV1),
}

impl HotspotUpdateRequest {
  pub fn hotspot_type(&self) -> &'static str {
    match self {
      HotspotUpdateRequest::Mobile(_) => "mobile",
      HotspotUpdateRequest::Iot(_) => "iot",
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn test_build_mobile_hotspot_update() {
    let data = json!({
        "block_height": 12345,
        "block_time_seconds": 1640995200,
        "pub_key": "112NqN2WWMwtK29PMzRby62fDydBJfsCLkCAf392stdok48ovNT6",
        "asset": "7isAuYXaNpBdxy95y5YktCS2tZWKWp5y7x8LjuVLjNtn",
        "serial_number": "SN123456",
        "device_type": "cbrs",
        "asserted_hex": "8c2681a306607ff",
        "azimuth": 180,
        "owner": "7isAuYXaNpBdxy95y5YktCS2tZWKWp5y7x8LjuVLjNtn",
        "owner_type": "direct_owner",
        "rewards_recipient": "7isAuYXaNpBdxy95y5YktCS2tZWKWp5y7x8LjuVLjNtn"
    });

    let change = ChangeRecord {
      table_name: "mobile_hotspots".to_string(),
      primary_key: "1".to_string(),
      change_column_value: "test".to_string(),
      changed_at: chrono::Utc::now(),
      atomic_data: json!([data]),
    };

    let keypair = Keypair::generate();
    let result = ProtobufBuilder::build_mobile_hotspot_update(&change, &keypair);

    assert!(result.is_ok());
    let req = result.unwrap();
    assert_eq!(req.signer, keypair.public_key().to_string());
    assert!(!req.signature.is_empty()); // Should have a valid signature
    assert!(req.update.is_some());

    let update = req.update.unwrap();
    assert_eq!(update.block_height, 12345);
    assert_eq!(update.block_time_seconds, 1640995200);
    assert!(update.pub_key.is_some());
    assert!(update.asset.is_some());
    assert!(update.metadata.is_some());
    assert!(update.owner.is_some());
  }
}
