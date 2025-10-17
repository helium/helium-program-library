use std::str::FromStr;

use anyhow::Result;
use bs58;
use helium_crypto::{Keypair, PublicKey, Sign};
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

use crate::{database::ChangeRecord, errors::AtomicDataError};

pub struct ProtobufBuilder;

impl ProtobufBuilder {
  fn current_timestamp() -> u64 {
    chrono::Utc::now().timestamp() as u64
  }

  fn get_required_field<'a>(
    data: &'a Value,
    field_name: &str,
  ) -> Result<&'a Value, AtomicDataError> {
    data.get(field_name).ok_or_else(|| {
      AtomicDataError::InvalidData(format!("Required field '{}' not found", field_name))
    })
  }

  fn get_u64_field(data: &Value, field_name: &str) -> Result<u64, AtomicDataError> {
    let field = Self::get_required_field(data, field_name)?;
    field
      .as_u64()
      .or_else(|| field.as_str()?.parse().ok())
      .ok_or_else(|| {
        AtomicDataError::InvalidData(format!("Field '{}' is not a valid u64", field_name))
      })
  }

  pub fn build_mobile_hotspot_changes(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<Vec<MobileHotspotChangeReqV1>, AtomicDataError> {
    let atomic_data_array = &change.atomic_data;

    let mut change_requests = Vec::with_capacity(atomic_data_array.len());

    for atomic_data in atomic_data_array {
      debug!("Building mobile hotspot update from data: {}", atomic_data);
      debug!(
        "Available keys in data: {:?}",
        atomic_data
          .as_object()
          .map(|obj| obj.keys().collect::<Vec<_>>())
      );

      let block = Self::get_u64_field(&atomic_data, "block")?;
      let timestamp_seconds = Self::current_timestamp();

      let pub_key = Self::extract_helium_pub_key(&atomic_data, "pub_key")?;
      let asset = Self::extract_solana_pub_key(&atomic_data, "asset")?;
      let metadata = Self::build_mobile_hotspot_metadata(&atomic_data)?;

      let change_msg = MobileHotspotChangeV1 {
        block,
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

      if !skip_signing {
        let signature = Self::sign_message(&request, keypair)?;
        request.signature = signature;
      }

      change_requests.push(request);
    }

    Ok(change_requests)
  }

  pub fn build_iot_hotspot_changes(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<Vec<IotHotspotChangeReqV1>, AtomicDataError> {
    let atomic_data_array = &change.atomic_data;

    let mut change_requests = Vec::with_capacity(atomic_data_array.len());

    for atomic_data in atomic_data_array {
      debug!("Building IoT hotspot update from data: {}", atomic_data);

      let block = Self::get_u64_field(atomic_data, "block")?;
      let timestamp_seconds = Self::current_timestamp();

      let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
      let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
      let metadata = Self::build_iot_hotspot_metadata(atomic_data)?;

      let change_msg = IotHotspotChangeV1 {
        block,
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

      if !skip_signing {
        let signature = Self::sign_message(&request, keypair)?;
        request.signature = signature;
      }

      change_requests.push(request);
    }

    Ok(change_requests)
  }

  pub fn build_entity_ownership_changes(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<Vec<EntityOwnershipChangeReqV1>, AtomicDataError> {
    let atomic_data_array = &change.atomic_data;
    let mut change_requests = Vec::with_capacity(atomic_data_array.len());

    for atomic_data in atomic_data_array {
      let block = Self::get_u64_field(atomic_data, "block")?;
      let timestamp_seconds = Self::current_timestamp();

      let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
      let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
      let owner = Self::build_entity_owner_info(atomic_data)?;

      let change_msg = EntityOwnerChangeV1 {
        block,
        timestamp_seconds,
        entity_pub_key: Some(pub_key),
        asset: Some(asset),
        owner: Some(owner),
      };

      let mut request = EntityOwnershipChangeReqV1 {
        change: Some(change_msg),
        signer: keypair.public_key().to_string(),
        signature: vec![],
      };

      if !skip_signing {
        let signature = Self::sign_message(&request, keypair)?;
        request.signature = signature;
      }

      change_requests.push(request);
    }

    Ok(change_requests)
  }

  pub fn build_entity_reward_destination_changes(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<Vec<EntityRewardDestinationChangeReqV1>, AtomicDataError> {
    let atomic_data_array = &change.atomic_data;

    let mut change_requests = Vec::with_capacity(atomic_data_array.len());

    for atomic_data in atomic_data_array {
      let block = Self::get_u64_field(atomic_data, "block")?;
      let timestamp_seconds = Self::current_timestamp();

      let entity_pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
      let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
      let rewards_destination = if let Some(rewards_split) =
        Self::try_build_rewards_split(atomic_data)?
      {
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
        block,
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

      if !skip_signing {
        let signature = Self::sign_message(&request, keypair)?;
        request.signature = signature;
      }

      change_requests.push(request);
    }

    Ok(change_requests)
  }

  fn build_mobile_hotspot_metadata(data: &Value) -> Result<MobileHotspotMetadata, AtomicDataError> {
    let serial_number = Self::safe_get_nested(data, &["deployment_info", "wifiInfoV0", "serial"])
      .and_then(|s| s.as_str())
      .map(|s| s.to_string())
      .or_else(|| Self::extract_string(data, "serial_number"))
      .unwrap_or_default();

    let device_type_str = Self::extract_string(data, "device_type")
      .ok_or_else(|| AtomicDataError::InvalidData("Missing device_type field".to_string()))?;

    let device_type = Self::parse_mobile_device_type(&device_type_str).unwrap_or_else(|_| {
      warn!(
        "Invalid mobile device type: {}, using Unknown",
        device_type_str
      );
      MobileHotspotDeviceType::Unknown
    });

    let asserted_hex = Self::extract_string(data, "asserted_hex")
      .or_else(|| Self::extract_string(data, "location"))
      .or_else(|| Self::extract_u64(data, "location").map(|loc| format!("{:x}", loc)))
      .unwrap_or_default();

    let azimuth = Self::safe_get_nested(data, &["deployment_info", "wifiInfoV0", "azimuth"])
      .and_then(|a| a.as_u64())
      .map(|a| a as u32)
      .or_else(|| Self::extract_u32(data, "azimuth"))
      .unwrap_or_default();

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

    let elevation = Self::extract_u32(data, "elevation").unwrap_or_default();

    let is_data_only = !Self::extract_bool(data, "is_full_hotspot")
      .ok_or_else(|| AtomicDataError::InvalidData("Missing is_full_hotspot field".to_string()))?;

    Ok(IotHotspotMetadata {
      asserted_hex,
      elevation,
      is_data_only,
    })
  }

  fn build_entity_owner_info(data: &Value) -> Result<EntityOwnerInfo, AtomicDataError> {
    let wallet = Self::extract_solana_pub_key(data, "owner")?;
    let owner_type_str = Self::extract_string(data, "owner_type")
      .ok_or_else(|| AtomicDataError::InvalidData("Missing owner_type field".to_string()))?;
    let owner_type = Self::parse_entity_owner_type(&owner_type_str).unwrap_or_else(|_| {
      warn!(
        "Invalid entity owner type: {}, using DirectOwner",
        owner_type_str
      );
      EntityOwnerType::DirectOwner
    });

    Ok(EntityOwnerInfo {
      wallet: Some(wallet),
      r#type: owner_type.into(),
    })
  }

  fn try_build_rewards_split(data: &Value) -> Result<Option<RewardsSplitV1>, AtomicDataError> {
    if let Some(split_data) = data
      .get("rewards_split")
      .filter(|v| !v.is_null() && !Self::is_empty_value(v))
    {
      let pub_key = Self::extract_solana_pub_key(split_data, "pub_key")?;
      let schedule = Self::extract_string(split_data, "schedule")
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
          AtomicDataError::InvalidData("Missing or empty schedule field".to_string())
        })?;
      let total_shares = Self::extract_u32(split_data, "total_shares")
        .ok_or_else(|| AtomicDataError::InvalidData("Missing total_shares field".to_string()))?;

      let recipients = if let Some(recipients_array) = split_data
        .get("recipients")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
      {
        let mut recipients = Vec::with_capacity(recipients_array.len());
        for recipient in recipients_array {
          if !Self::is_empty_value(recipient) {
            if let Ok(split_recipient) = Self::try_build_split_recipient(recipient) {
              recipients.push(split_recipient);
            }
          }
        }
        recipients
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

    let decoded = PublicKey::from_str(&key_str).map_err(|e| {
      AtomicDataError::InvalidData(format!(
        "Invalid base58 helium pub key {} (value: '{}'): {}",
        key, key_str, e
      ))
    })?;

    Ok(HeliumPubKey {
      value: decoded.to_vec(),
    })
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

  fn is_empty_value(value: &Value) -> bool {
    match value {
      Value::Object(obj) => obj.is_empty(),
      Value::Array(arr) => arr.is_empty(),
      Value::String(s) => s.is_empty(),
      Value::Null => true,
      _ => false,
    }
  }

  fn safe_get_nested<'a>(data: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = data;
    for key in path {
      current = current
        .get(key)
        .filter(|v| !v.is_null() && !Self::is_empty_value(v))?;
    }
    Some(current)
  }

  fn extract_string(data: &Value, key: &str) -> Option<String> {
    data
      .get(key)?
      .as_str()
      .filter(|s| !s.is_empty())
      .map(|s| s.to_string())
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

  fn parse_mobile_device_type(
    device_type_str: &str,
  ) -> Result<MobileHotspotDeviceType, AtomicDataError> {
    match device_type_str {
      "wifiIndoor" => Ok(MobileHotspotDeviceType::WifiIndoor),
      "wifiOutdoor" => Ok(MobileHotspotDeviceType::WifiOutdoor),
      "wifiDataOnly" => Ok(MobileHotspotDeviceType::WifiDataOnly),
      "cbrs" => Ok(MobileHotspotDeviceType::Cbrs),
      _ => Err(AtomicDataError::InvalidData(format!(
        "Unknown mobile device type: {}",
        device_type_str
      ))),
    }
  }

  fn parse_entity_owner_type(owner_type_str: &str) -> Result<EntityOwnerType, AtomicDataError> {
    match owner_type_str {
      "direct_owner" => Ok(EntityOwnerType::DirectOwner),
      "welcome_pack_owner" => Ok(EntityOwnerType::WelcomePackOwner),
      _ => Err(AtomicDataError::InvalidData(format!(
        "Unknown entity owner type: {}",
        owner_type_str
      ))),
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

pub fn build_entity_change_requests(
  change: &ChangeRecord,
  change_type: &str,
  keypair: &Keypair,
  skip_signing: bool,
) -> Result<Vec<EntityChangeRequest>, AtomicDataError> {
  match change_type {
    "mobile_hotspot" => {
      let reqs = ProtobufBuilder::build_mobile_hotspot_changes(change, keypair, skip_signing)?;
      Ok(
        reqs
          .into_iter()
          .map(EntityChangeRequest::MobileHotspot)
          .collect(),
      )
    }
    "iot_hotspot" => {
      let reqs = ProtobufBuilder::build_iot_hotspot_changes(change, keypair, skip_signing)?;
      Ok(
        reqs
          .into_iter()
          .map(EntityChangeRequest::IotHotspot)
          .collect(),
      )
    }
    "entity_ownership" => {
      let reqs = ProtobufBuilder::build_entity_ownership_changes(change, keypair, skip_signing)?;
      Ok(
        reqs
          .into_iter()
          .map(EntityChangeRequest::EntityOwnership)
          .collect(),
      )
    }
    "entity_reward_destination" => {
      let reqs =
        ProtobufBuilder::build_entity_reward_destination_changes(change, keypair, skip_signing)?;
      Ok(
        reqs
          .into_iter()
          .map(EntityChangeRequest::EntityRewardDestination)
          .collect(),
      )
    }
    _ => Err(AtomicDataError::InvalidData(format!(
      "Unknown change type: {}",
      change_type
    ))),
  }
}
