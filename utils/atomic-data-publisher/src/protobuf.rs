use anyhow::Result;
use bs58;
use helium_crypto::{Keypair, Sign};
use helium_proto::services::chain_rewardable_entities::{
  entity_reward_destination_change_v1, split_recipient_info_v1, EntityOwnerChangeV1,
  EntityOwnerInfo, EntityOwnerType, EntityOwnershipChangeReqV1, EntityRewardDestinationChangeReqV1,
  EntityRewardDestinationChangeV1, HeliumPubKey, IotHotspotChangeReqV1, IotHotspotChangeV1,
  IotHotspotMetadata, MobileHotspotChangeReqV1, MobileHotspotChangeV1, MobileHotspotDeviceType,
  MobileHotspotMetadata, RewardsSplitV1, SolanaPubKey, SplitRecipientInfoV1,
};
use prost::Message;
use serde_json::Value;
use tracing::{debug, warn};

use crate::database::ChangeRecord;
use crate::errors::AtomicDataError;

pub struct ProtobufBuilder;

impl ProtobufBuilder {
  pub fn build_mobile_hotspot_change(
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

    debug!("Building mobile hotspot update from data: {}", atomic_data);
    debug!(
      "Available keys in data: {:?}",
      atomic_data
        .as_object()
        .map(|obj| obj.keys().collect::<Vec<_>>())
    );

    let block_height = Self::extract_u64(atomic_data, "block_height").unwrap_or(0);
    let timestamp_seconds = chrono::Utc::now().timestamp() as u64;

    let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let metadata = Self::build_mobile_hotspot_metadata(atomic_data)?;

    let change_msg = MobileHotspotChangeV1 {
      block_height,
      timestamp_seconds,
      pub_key: Some(pub_key),
      asset: Some(asset),
      metadata: Some(metadata),
    };

    let mut request = MobileHotspotChangeReqV1 {
      change: Some(change_msg),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

    let signature = Self::sign_message(&request, keypair)?;
    request.signature = signature;

    Ok(request)
  }

  pub fn build_iot_hotspot_change(
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

    debug!("Building IoT hotspot update from data: {}", atomic_data);

    let block_height = Self::extract_u64(atomic_data, "block_height").unwrap_or(0);
    let timestamp_seconds = chrono::Utc::now().timestamp() as u64;

    let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let metadata = Self::build_iot_hotspot_metadata(atomic_data)?;

    let change_msg = IotHotspotChangeV1 {
      block_height,
      timestamp_seconds,
      pub_key: Some(pub_key),
      asset: Some(asset),
      metadata: Some(metadata),
    };

    let mut request = IotHotspotChangeReqV1 {
      change: Some(change_msg),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

    let signature = Self::sign_message(&request, keypair)?;
    request.signature = signature;

    Ok(request)
  }

  pub fn build_entity_ownership_change(
    change: &ChangeRecord,
    keypair: &Keypair,
  ) -> Result<EntityOwnershipChangeReqV1, AtomicDataError> {
    let atomic_data = change
      .atomic_data
      .as_array()
      .and_then(|arr| arr.first())
      .ok_or_else(|| {
        AtomicDataError::InvalidData("No atomic data found in change record".to_string())
      })?;

    let block_height = Self::extract_u64(atomic_data, "block_height").unwrap_or(0);
    let timestamp_seconds = chrono::Utc::now().timestamp() as u64;

    let entity_pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let owner = Self::build_entity_owner_info(atomic_data)?;

    let change_msg = EntityOwnerChangeV1 {
      block_height,
      timestamp_seconds,
      entity_pub_key: Some(entity_pub_key),
      asset: Some(asset),
      owner: Some(owner),
    };

    let mut request = EntityOwnershipChangeReqV1 {
      change: Some(change_msg),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

    let signature = Self::sign_message(&request, keypair)?;
    request.signature = signature;

    Ok(request)
  }

  pub fn build_entity_reward_destination_change(
    change: &ChangeRecord,
    keypair: &Keypair,
  ) -> Result<EntityRewardDestinationChangeReqV1, AtomicDataError> {
    let atomic_data = change
      .atomic_data
      .as_array()
      .and_then(|arr| arr.first())
      .ok_or_else(|| {
        AtomicDataError::InvalidData("No atomic data found in change record".to_string())
      })?;

    let block_height = Self::extract_u64(atomic_data, "block_height").unwrap_or(0);
    let timestamp_seconds = chrono::Utc::now().timestamp() as u64;

    let entity_pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let rewards_destination =
      if let Some(rewards_split) = Self::try_build_rewards_split(atomic_data)? {
        Some(entity_reward_destination_change_v1::RewardsDestination::RewardsSplitV1(rewards_split))
      } else if let Some(rewards_recipient) =
        Self::try_extract_solana_pub_key(atomic_data, "rewards_recipient")
      {
        Some(
          entity_reward_destination_change_v1::RewardsDestination::RewardsRecipient(
            rewards_recipient,
          ),
        )
      } else {
        return Err(AtomicDataError::InvalidData(
          "No rewards destination found".to_string(),
        ));
      };

    let change_msg = EntityRewardDestinationChangeV1 {
      block_height,
      timestamp_seconds,
      entity_pub_key: Some(entity_pub_key),
      asset: Some(asset),
      rewards_destination,
    };

    let mut request = EntityRewardDestinationChangeReqV1 {
      change: Some(change_msg),
      signer: keypair.public_key().to_string(),
      signature: vec![],
    };

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
      .or_else(|| Self::extract_u64(data, "location").map(|loc| format!("{:x}", loc)))
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

  fn sign_message<T>(msg: &T, keypair: &Keypair) -> Result<Vec<u8>, AtomicDataError>
  where
    T: Message + Clone,
  {
    let signature = Sign::sign(keypair, &msg.encode_to_vec())
      .map_err(|e| AtomicDataError::InvalidData(format!("Failed to sign message: {}", e)))?;

    Ok(signature.to_vec())
  }
}

#[derive(Debug, Clone)]
pub enum EntityChangeRequest {
  MobileHotspot(MobileHotspotChangeReqV1),
  IotHotspot(IotHotspotChangeReqV1),
  EntityOwnership(EntityOwnershipChangeReqV1),
  EntityRewardDestination(EntityRewardDestinationChangeReqV1),
}

pub fn build_entity_change_request(
  change: &ChangeRecord,
  change_type: &str,
  keypair: &Keypair,
) -> Result<EntityChangeRequest, AtomicDataError> {
  match change_type {
    "mobile_hotspot" => {
      let req = ProtobufBuilder::build_mobile_hotspot_change(change, keypair)?;
      Ok(EntityChangeRequest::MobileHotspot(req))
    }
    "iot_hotspot" => {
      let req = ProtobufBuilder::build_iot_hotspot_change(change, keypair)?;
      Ok(EntityChangeRequest::IotHotspot(req))
    }
    "entity_ownership" => {
      let req = ProtobufBuilder::build_entity_ownership_change(change, keypair)?;
      Ok(EntityChangeRequest::EntityOwnership(req))
    }
    "entity_reward_destination" => {
      let req = ProtobufBuilder::build_entity_reward_destination_change(change, keypair)?;
      Ok(EntityChangeRequest::EntityRewardDestination(req))
    }
    _ => Err(AtomicDataError::InvalidData(format!(
      "Unknown change type: {}",
      change_type
    ))),
  }
}
