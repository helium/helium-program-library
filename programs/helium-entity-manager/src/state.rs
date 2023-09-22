use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct RewardableEntityConfigV0 {
  pub authority: Pubkey,
  pub symbol: String,
  pub sub_dao: Pubkey,
  pub settings: ConfigSettingsV0,

  pub bump_seed: u8,
  pub staking_requirement: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq)]
pub enum MobileDeviceTypeV0 {
  #[default]
  Cbrs,
  WifiIndoor,
  WifiOutdoor,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct DeviceFeesV0 {
  pub device_type: MobileDeviceTypeV0,
  pub dc_onboarding_fee: u64,
  pub location_staking_fee: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
#[allow(deprecated)]
pub enum ConfigSettingsV0 {
  IotConfig {
    min_gain: i32,
    max_gain: i32,
    full_location_staking_fee: u64,
    dataonly_location_staking_fee: u64,
  },
  // Deprecated, use MobileConfigV1
  MobileConfig {
    full_location_staking_fee: u64,
    dataonly_location_staking_fee: u64,
  },
  MobileConfigV1 {
    fees_by_device: Vec<DeviceFeesV0>,
  },
}

impl ConfigSettingsV0 {
  #[allow(deprecated)]
  pub fn mobile_device_fees(&self, device: MobileDeviceTypeV0) -> Option<DeviceFeesV0> {
    match self {
      ConfigSettingsV0::MobileConfig {
        full_location_staking_fee,
        ..
      } => Some(DeviceFeesV0 {
        device_type: MobileDeviceTypeV0::Cbrs,
        dc_onboarding_fee: 4000000_u64,
        location_staking_fee: *full_location_staking_fee,
      }),
      ConfigSettingsV0::MobileConfigV1 { fees_by_device, .. } => fees_by_device
        .iter()
        .find(|d| d.device_type == device)
        .copied(),
      _ => None,
    }
  }
}

impl ConfigSettingsV0 {
  pub fn validate_iot_gain(&self, gain: Option<i32>) -> bool {
    match self {
      ConfigSettingsV0::IotConfig {
        max_gain, min_gain, ..
      } => gain
        .map(|gain| &gain <= max_gain && &gain >= min_gain)
        .unwrap_or(true),
      _ => false,
    }
  }
  pub fn is_mobile(&self) -> bool {
    matches!(self, ConfigSettingsV0::MobileConfigV1 { .. })
      || matches!(self, ConfigSettingsV0::MobileConfig { .. })
  }

  pub fn is_iot(&self) -> bool {
    matches!(self, ConfigSettingsV0::IotConfig { .. })
  }
}

impl Default for ConfigSettingsV0 {
  fn default() -> Self {
    ConfigSettingsV0::IotConfig {
      min_gain: 0,
      max_gain: 10000000,
      full_location_staking_fee: 0,
      dataonly_location_staking_fee: 0,
    }
  }
}

#[account]
#[derive(Default)]
pub struct MakerV0 {
  pub update_authority: Pubkey,  //
  pub issuing_authority: Pubkey, // Maker issuing these hotspots
  pub name: String,
  pub bump_seed: u8,
  pub collection: Pubkey, // The metaplex collection to be issued
  pub merkle_tree: Pubkey,
  pub collection_bump_seed: u8,
  pub dao: Pubkey,
}

#[account]
#[derive(Default)]
pub struct MakerApprovalV0 {
  pub rewardable_entity_config: Pubkey,
  pub maker: Pubkey,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct DataOnlyConfigV0 {
  pub authority: Pubkey,
  pub bump_seed: u8,
  pub collection: Pubkey, // The metaplex collection to be issued
  pub merkle_tree: Pubkey,
  pub collection_bump_seed: u8,
  pub dao: Pubkey,
  pub new_tree_depth: u32, // parameters for new merkle trees when old is full
  pub new_tree_buffer_size: u32,
  pub new_tree_space: u64,
  pub new_tree_fee_lamports: u64,
}

#[account]
#[derive(Default)]
pub struct ProgramApprovalV0 {
  pub dao: Pubkey,
  pub program_id: Pubkey,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct KeyToAssetV0 {
  pub dao: Pubkey,
  pub asset: Pubkey,
  pub entity_key: Vec<u8>,
  pub bump_seed: u8,
  pub key_serialization: KeySerialization,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub enum KeySerialization {
  #[default]
  B58,
  UTF8,
}

#[account]
#[derive(Default)]
pub struct IotHotspotInfoV0 {
  pub asset: Pubkey,
  pub bump_seed: u8,

  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
  pub is_full_hotspot: bool,
  pub num_location_asserts: u16,
  pub is_active: bool,
  pub dc_onboarding_fee_paid: u64,
}
pub const IOT_HOTSPOT_INFO_SIZE: usize = 8 +
    32 + // asset
    1 + // bump
    1 + 8 + // location
    1 + 4 + // elevation
    1 + 4 +// gain
    1 + // is full hotspot
    2 + // num location asserts
    1 + // is active
    8 + // dc onboarding fee paid
    60; // pad

#[account]
#[derive(Default)]
pub struct MobileHotspotInfoV0 {
  pub asset: Pubkey,
  pub bump_seed: u8,

  pub location: Option<u64>,
  pub is_full_hotspot: bool,
  pub num_location_asserts: u16,
  pub is_active: bool,
  pub dc_onboarding_fee_paid: u64,
  pub device_type: MobileDeviceTypeV0,
}
pub const MOBILE_HOTSPOT_INFO_SIZE: usize = 8 +
    32 + // asset
    1 + // bump
    1 + 8 + // location
    1 + // is full hotspot
    2 + // num location asserts
    1 + // is active
    8 + // dc onboarding fee paid
    60; // pad

#[macro_export]
macro_rules! data_only_config_seeds {
  ( $data_only_config:expr ) => {
    &[
      "data_only_config".as_bytes(),
      $data_only_config.dao.as_ref(),
      &[$data_only_config.bump_seed],
    ]
  };
}

#[macro_export]
macro_rules! rewardable_entity_config_seeds {
  ( $rewardable_entity_config:expr ) => {
    &[
      "rewardable_entity_config".as_bytes(),
      $rewardable_entity_config.sub_dao.as_ref(),
      $rewardable_entity_config.symbol.as_bytes(),
      &[$rewardable_entity_config.bump_seed],
    ]
  };
}

#[macro_export]
macro_rules! iot_info_seeds {
  ( $iot_info:expr, $rewardable_entity_config:expr, $entity_key:expr ) => {
    &[
      "iot_info".as_bytes(),
      $rewardable_entity_config.key().as_ref(),
      &hash(&$entity_key).to_bytes(),
      &[$iot_info.bump_seed],
    ]
  };
}

#[macro_export]
macro_rules! mobile_info_seeds {
  ( $mobile_info:expr, $rewardable_entity_config:expr, $entity_key:expr ) => {
    &[
      "mobile_info".as_bytes(),
      $rewardable_entity_config.key().as_ref(),
      &hash(&$entity_key).to_bytes(),
      &[$mobile_info.bump_seed],
    ]
  };
}

#[macro_export]
macro_rules! key_to_asset_seeds {
  ( $key_to_asset:expr ) => {
    &[
      "key_to_asset".as_bytes(),
      $key_to_asset.dao.as_ref(),
      &anchor_lang::solana_program::hash::hash(&$key_to_asset.entity_key[..]).to_bytes(),
      &[$key_to_asset.bump_seed],
    ]
  };
}
