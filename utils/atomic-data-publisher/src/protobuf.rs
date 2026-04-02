use anyhow::Result;
use bs58;
use helium_crypto::{Keypair, PublicKeyBinary, Sign};
use helium_proto::services::chain_rewardable_entities::{
  entity_reward_destination_change_v1, split_recipient_info_v1, EntityOwnerChangeV1,
  EntityOwnerInfo, EntityOwnerType, EntityOwnershipChangeReqV1, EntityRewardDestinationChangeReqV1,
  EntityRewardDestinationChangeV1, HeliumPubKey, IotHotspotChangeReqV1, IotHotspotChangeV1,
  IotHotspotMetadata, MobileHotspotChangeReqV1, MobileHotspotChangeV1, MobileHotspotDeviceType,
  MobileHotspotMetadata, RewardsSplitV1, SolanaPubKey, SplitRecipientInfoV1,
};
use prost::Message;
use serde_json::Value;
use std::str::FromStr;
use tracing::{debug, error, warn};

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

  pub fn build_mobile_hotspot_change(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<MobileHotspotChangeReqV1, AtomicDataError> {
    let atomic_data = &change.atomic_data;

    debug!("Building mobile hotspot update from data: {}", atomic_data);
    debug!(
      "Available keys in data: {:?}",
      atomic_data
        .as_object()
        .map(|obj| obj.keys().collect::<Vec<_>>())
    );

    let block = Self::get_u64_field(atomic_data, "block")?;
    let timestamp_seconds = Self::current_timestamp();

    let pub_key = Self::extract_helium_pub_key(atomic_data, "pub_key")?;
    let asset = Self::extract_solana_pub_key(atomic_data, "asset")?;
    let metadata = Self::build_mobile_hotspot_metadata(atomic_data)?;

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

    Ok(request)
  }

  pub fn build_iot_hotspot_change(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<IotHotspotChangeReqV1, AtomicDataError> {
    let atomic_data = &change.atomic_data;

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

    Ok(request)
  }

  pub fn build_entity_ownership_change(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<EntityOwnershipChangeReqV1, AtomicDataError> {
    let atomic_data = &change.atomic_data;

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

    Ok(request)
  }

  pub fn build_entity_reward_destination_change(
    change: &ChangeRecord,
    keypair: &Keypair,
    skip_signing: bool,
  ) -> Result<EntityRewardDestinationChangeReqV1, AtomicDataError> {
    let atomic_data = &change.atomic_data;

    let block = Self::get_u64_field(atomic_data, "block")?;
    let timestamp_seconds = Self::current_timestamp();

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

    Ok(request)
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
      "Looking for helium pub key field '{}' in data. Available fields: {:?}",
      key,
      data.as_object().map(|obj| obj.keys().collect::<Vec<_>>())
    );
    debug!("Value at field '{}': {:?}", key, data.get(key));

    let field_value = match data.get(key) {
      Some(val) => val,
      None => {
        let err_msg = format!(
          "Missing helium pub key field: '{}'. Available fields: {:?}",
          key,
          data.as_object().map(|obj| obj.keys().collect::<Vec<_>>())
        );
        error!("{}", err_msg);
        return Err(AtomicDataError::InvalidData(err_msg));
      }
    };

    let bytes = if let Some(hex_str) = field_value.as_str() {
      match hex::decode(hex_str) {
        Ok(b) => b,
        Err(e) => {
          let err_msg = format!(
            "Invalid hex helium pub key field '{}': {} (value: '{}')",
            key, e, hex_str
          );
          error!("{}", err_msg);
          return Err(AtomicDataError::InvalidData(err_msg));
        }
      }
    } else {
      let err_msg = format!(
        "Invalid helium pub key field '{}': expected hex string but got {:?}",
        key, field_value
      );
      error!("{}", err_msg);
      return Err(AtomicDataError::InvalidData(err_msg));
    };

    debug!("Decoded helium pub key bytes (len={})", bytes.len());

    let public_key_binary = match PublicKeyBinary::from_str(&bs58::encode(&bytes).into_string()) {
      Ok(pk) => pk,
      Err(e) => {
        let err_msg = format!(
          "Invalid public key for field '{}': {} (decoded {} bytes from hex, bs58: '{}')",
          key,
          e,
          bytes.len(),
          bs58::encode(&bytes).into_string()
        );
        error!("{}", err_msg);
        return Err(AtomicDataError::InvalidData(err_msg));
      }
    };

    Ok(HeliumPubKey {
      value: public_key_binary.into(),
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

pub fn build_entity_change_request(
  change: &ChangeRecord,
  change_type: &str,
  keypair: &Keypair,
  skip_signing: bool,
) -> Result<EntityChangeRequest, AtomicDataError> {
  match change_type {
    "mobile_hotspot" => {
      let req = ProtobufBuilder::build_mobile_hotspot_change(change, keypair, skip_signing)?;
      Ok(EntityChangeRequest::MobileHotspot(req))
    }
    "iot_hotspot" => {
      let req = ProtobufBuilder::build_iot_hotspot_change(change, keypair, skip_signing)?;
      Ok(EntityChangeRequest::IotHotspot(req))
    }
    "entity_ownership" => {
      let req = ProtobufBuilder::build_entity_ownership_change(change, keypair, skip_signing)?;
      Ok(EntityChangeRequest::EntityOwnership(req))
    }
    "entity_reward_destination" => {
      let req =
        ProtobufBuilder::build_entity_reward_destination_change(change, keypair, skip_signing)?;
      Ok(EntityChangeRequest::EntityRewardDestination(req))
    }
    _ => Err(AtomicDataError::InvalidData(format!(
      "Unknown change type: {}",
      change_type
    ))),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_fixtures::*;
  use helium_crypto::Verify;
  use helium_proto::services::chain_rewardable_entities::{
    entity_reward_destination_change_v1, split_recipient_info_v1, MobileHotspotDeviceType,
  };
  use serde_json::json;

  // --- Mobile Hotspot ---

  #[test]
  fn build_mobile_hotspot_wifi_outdoor() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let data = mobile_hotspot_json(
      &pub_key_hex,
      &asset,
      "wifiOutdoor",
      json!({
        "wifiInfoV0": {
          "serial": "test-serial-123",
          "azimuth": 180
        }
      }),
      100,
    );
    let record = make_change_record("job", "query", 100, data);
    let result = ProtobufBuilder::build_mobile_hotspot_change(&record, &kp, true).unwrap();
    let change = result.change.unwrap();
    let metadata = change.metadata.unwrap();

    assert_eq!(
      metadata.device_type,
      i32::from(MobileHotspotDeviceType::WifiOutdoor)
    );
    assert_eq!(metadata.serial_number, "test-serial-123");
    assert_eq!(metadata.azimuth, 180);
    assert_eq!(change.block, 100);
    let expected_pub_key: Vec<u8> = PublicKeyBinary::from(kp.public_key().clone()).into();
    assert_eq!(change.pub_key.unwrap().value, expected_pub_key);
    assert_eq!(
      change.asset.unwrap().value,
      bs58::decode(&asset).into_vec().unwrap()
    );
  }

  #[test]
  fn parse_mobile_device_type_all_variants() {
    assert_eq!(
      ProtobufBuilder::parse_mobile_device_type("wifiIndoor").unwrap(),
      MobileHotspotDeviceType::WifiIndoor
    );
    assert_eq!(
      ProtobufBuilder::parse_mobile_device_type("wifiOutdoor").unwrap(),
      MobileHotspotDeviceType::WifiOutdoor
    );
    assert_eq!(
      ProtobufBuilder::parse_mobile_device_type("wifiDataOnly").unwrap(),
      MobileHotspotDeviceType::WifiDataOnly
    );
    assert_eq!(
      ProtobufBuilder::parse_mobile_device_type("cbrs").unwrap(),
      MobileHotspotDeviceType::Cbrs
    );
    assert!(ProtobufBuilder::parse_mobile_device_type("banana").is_err());
  }

  // --- IoT Hotspot ---

  #[test]
  fn build_iot_hotspot_with_location_and_elevation() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let data = iot_hotspot_json(
      &pub_key_hex,
      &asset,
      500,
      Some("8c2ab38b6e899ff"),
      Some(42),
      Some(12),
      true,
    );
    let record = make_change_record("job", "query", 500, data);
    let result = ProtobufBuilder::build_iot_hotspot_change(&record, &kp, true).unwrap();
    let change = result.change.unwrap();
    let metadata = change.metadata.unwrap();

    assert_eq!(metadata.asserted_hex, "8c2ab38b6e899ff");
    assert_eq!(metadata.elevation, 42);
    assert!(!metadata.is_data_only);
    assert_eq!(change.block, 500);
  }

  #[test]
  fn build_iot_hotspot_without_location() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let data = iot_hotspot_json(&pub_key_hex, &asset, 600, None, None, None, true);
    let record = make_change_record("job", "query", 600, data);
    let result = ProtobufBuilder::build_iot_hotspot_change(&record, &kp, true).unwrap();
    let metadata = result.change.unwrap().metadata.unwrap();

    assert_eq!(metadata.asserted_hex, "");
    assert_eq!(metadata.elevation, 0);
    assert!(!metadata.is_data_only);
  }

  #[test]
  fn build_iot_hotspot_data_only() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let data = iot_hotspot_json(&pub_key_hex, &asset, 700, None, None, None, false);
    let record = make_change_record("job", "query", 700, data);
    let result = ProtobufBuilder::build_iot_hotspot_change(&record, &kp, true).unwrap();
    let metadata = result.change.unwrap().metadata.unwrap();

    assert!(metadata.is_data_only);
    assert_eq!(metadata.asserted_hex, "");
    assert_eq!(metadata.elevation, 0);
  }

  // --- Entity Ownership ---

  fn build_ownership(
    kp: &Keypair,
    pub_key_hex: &str,
    asset: &str,
    owner: &str,
    owner_type: &str,
    block: u64,
  ) -> EntityOwnerInfo {
    let data = entity_ownership_json(pub_key_hex, asset, owner, owner_type, block);
    let record = make_change_record("job", "query", block, data);
    ProtobufBuilder::build_entity_ownership_change(&record, kp, true)
      .unwrap()
      .change
      .unwrap()
      .owner
      .unwrap()
  }

  fn assert_owner_info(info: &EntityOwnerInfo, expected_type: EntityOwnerType, wallet_b58: &str) {
    assert_eq!(info.r#type, i32::from(expected_type));
    let expected_bytes = bs58::decode(wallet_b58).into_vec().unwrap();
    assert_eq!(info.wallet.as_ref().unwrap().value, expected_bytes);
  }

  #[test]
  fn build_entity_ownership_direct_owner() {
    let kp = test_keypair();
    let owner = test_solana_pubkey_n(2);
    let info = build_ownership(
      &kp,
      &test_entity_key_hex(&kp),
      &test_solana_pubkey(),
      &owner,
      "direct_owner",
      800,
    );
    assert_owner_info(&info, EntityOwnerType::DirectOwner, &owner);
  }

  #[test]
  fn build_entity_ownership_welcome_pack() {
    let kp = test_keypair();
    let owner = test_solana_pubkey_n(3);
    let info = build_ownership(
      &kp,
      &test_entity_key_hex(&kp),
      &test_solana_pubkey(),
      &owner,
      "welcome_pack_owner",
      900,
    );
    assert_owner_info(&info, EntityOwnerType::WelcomePackOwner, &owner);
  }

  #[test]
  fn ownership_transition_welcome_pack_to_direct() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let welcome_wallet = test_solana_pubkey_n(10);
    let user_wallet = test_solana_pubkey_n(11);

    let pack = build_ownership(
      &kp,
      &pub_key_hex,
      &asset,
      &welcome_wallet,
      "welcome_pack_owner",
      800,
    );
    assert_owner_info(&pack, EntityOwnerType::WelcomePackOwner, &welcome_wallet);

    let direct = build_ownership(&kp, &pub_key_hex, &asset, &user_wallet, "direct_owner", 900);
    assert_owner_info(&direct, EntityOwnerType::DirectOwner, &user_wallet);
  }

  #[test]
  fn unknown_owner_type_defaults_to_direct_owner() {
    let kp = test_keypair();
    let wallet = test_solana_pubkey_n(12);
    let info = build_ownership(
      &kp,
      &test_entity_key_hex(&kp),
      &test_solana_pubkey(),
      &wallet,
      "some_unknown_type",
      1000,
    );
    assert_owner_info(&info, EntityOwnerType::DirectOwner, &wallet);
  }

  // --- Reward Destination ---

  #[test]
  fn build_reward_destination_direct_recipient() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let recipient = test_solana_pubkey_n(4);
    let data = reward_destination_direct_json(&pub_key_hex, &asset, &recipient, 1000);
    let record = make_change_record("job", "query", 1000, data);
    let result =
      ProtobufBuilder::build_entity_reward_destination_change(&record, &kp, true).unwrap();
    let change = result.change.unwrap();

    match change.rewards_destination {
      Some(entity_reward_destination_change_v1::RewardsDestination::RewardsRecipient(
        solana_pk,
      )) => {
        let expected = bs58::decode(&recipient).into_vec().unwrap();
        assert_eq!(solana_pk.value, expected);
      }
      other => panic!("expected RewardsRecipient, got {:?}", other),
    }
  }

  #[test]
  fn build_reward_destination_mini_fanout() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let fanout = test_solana_pubkey_n(5);
    let authority1 = test_solana_pubkey_n(6);
    let recipient1 = test_solana_pubkey_n(7);
    let authority2 = test_solana_pubkey_n(8);
    let recipient2 = test_solana_pubkey_n(9);

    let recipients = vec![
      json!({
        "authority": authority1,
        "recipient": recipient1,
        "shares": 6000
      }),
      json!({
        "authority": authority2,
        "recipient": recipient2,
        "shares": 4000
      }),
    ];

    let data = reward_destination_fanout_json(&pub_key_hex, &asset, &fanout, recipients, 1100);
    let record = make_change_record("job", "query", 1100, data);
    let result =
      ProtobufBuilder::build_entity_reward_destination_change(&record, &kp, true).unwrap();
    let change = result.change.unwrap();

    match change.rewards_destination {
      Some(entity_reward_destination_change_v1::RewardsDestination::RewardsSplitV1(split)) => {
        assert_eq!(split.schedule, "daily");
        assert_eq!(split.total_shares, 10000);
        assert_eq!(split.recipients.len(), 2);

        let r0 = &split.recipients[0];
        assert_eq!(
          r0.reward_amount,
          Some(split_recipient_info_v1::RewardAmount::Shares(6000))
        );
        assert_eq!(
          r0.authority.as_ref().unwrap().value,
          bs58::decode(&authority1).into_vec().unwrap()
        );
        assert_eq!(
          r0.recipient.as_ref().unwrap().value,
          bs58::decode(&recipient1).into_vec().unwrap()
        );

        let r1 = &split.recipients[1];
        assert_eq!(
          r1.reward_amount,
          Some(split_recipient_info_v1::RewardAmount::Shares(4000))
        );
        assert_eq!(
          r1.authority.as_ref().unwrap().value,
          bs58::decode(&authority2).into_vec().unwrap()
        );
        assert_eq!(
          r1.recipient.as_ref().unwrap().value,
          bs58::decode(&recipient2).into_vec().unwrap()
        );
      }
      other => panic!("expected RewardsSplitV1, got {:?}", other),
    }
  }

  // --- Dispatcher ---

  #[test]
  fn dispatch_unknown_type_errors() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let data = mobile_hotspot_json(&pub_key_hex, &asset, "wifiOutdoor", json!({}), 70);
    let record = make_change_record("job", "query", 70, data);
    let result = build_entity_change_request(&record, "banana", &kp, true);
    assert!(result.is_err());
  }

  // --- Signing ---

  #[test]
  fn signing_produces_valid_signature() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let asset = test_solana_pubkey();
    let data = mobile_hotspot_json(&pub_key_hex, &asset, "wifiOutdoor", json!({}), 80);
    let record = make_change_record("job", "query", 80, data);
    let result = ProtobufBuilder::build_mobile_hotspot_change(&record, &kp, false).unwrap();

    let mut unsigned = result.clone();
    unsigned.signature = vec![];
    let message_bytes = unsigned.encode_to_vec();

    kp.public_key()
      .verify(&message_bytes, &result.signature)
      .expect("signature should be cryptographically valid");
  }

  // --- Error Paths ---

  #[test]
  fn missing_pub_key_errors() {
    let kp = test_keypair();
    let data = json!({
      "asset": test_solana_pubkey(),
      "device_type": "wifiOutdoor",
      "block": 1
    });
    let record = make_change_record("job", "query", 1, data);
    let err = ProtobufBuilder::build_mobile_hotspot_change(&record, &kp, true).unwrap_err();
    assert!(
      matches!(&err, AtomicDataError::InvalidData(msg) if msg.contains("pub_key")),
      "expected InvalidData mentioning pub_key, got: {err}"
    );
  }

  #[test]
  fn invalid_hex_pub_key_errors() {
    let kp = test_keypair();
    let data = json!({
      "pub_key": "not_valid_hex!!!",
      "asset": test_solana_pubkey(),
      "device_type": "wifiOutdoor",
      "block": 1
    });
    let record = make_change_record("job", "query", 1, data);
    let err = ProtobufBuilder::build_mobile_hotspot_change(&record, &kp, true).unwrap_err();
    assert!(
      matches!(&err, AtomicDataError::InvalidData(msg) if msg.contains("hex")),
      "expected InvalidData mentioning hex, got: {err}"
    );
  }

  #[test]
  fn no_reward_destination_errors() {
    let kp = test_keypair();
    let pub_key_hex = test_entity_key_hex(&kp);
    let data = json!({
      "pub_key": pub_key_hex,
      "asset": test_solana_pubkey(),
      "block": 1
    });
    let record = make_change_record("job", "query", 1, data);
    let err =
      ProtobufBuilder::build_entity_reward_destination_change(&record, &kp, true).unwrap_err();
    assert!(
      matches!(&err, AtomicDataError::InvalidData(msg) if msg.contains("reward")),
      "expected InvalidData mentioning reward, got: {err}"
    );
  }
}
