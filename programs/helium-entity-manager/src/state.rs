use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct RewardableEntityConfigV0 {
  pub authority: Pubkey,
  pub symbol: String,
  pub sub_dao: Pubkey,
  pub settings: ConfigSettingsV0,

  pub bump_seed: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum ConfigSettingsV0 {
  IotConfig {
    min_gain: i32,
    max_gain: i32,
    full_location_staking_fee: u64,
    dataonly_location_staking_fee: u64,
  },
  MobileConfig {
    full_location_staking_fee: u64,
    dataonly_location_staking_fee: u64,
  },
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
  pub bump_seed: u8,
  pub collection: Pubkey, // The metaplex collection to be issued
  pub merkle_tree: Pubkey,
  pub collection_bump_seed: u8,
  pub dao: Pubkey,
  pub new_tree_depth: u32, // parameters for new merkle trees when old is full
  pub new_tree_buffer_size: u32,
  pub new_tree_fee_lamports: u64,
}

#[account]
#[derive(Default)]
pub struct KeyToAssetV0 {
  pub dao: Pubkey,
  pub asset: Pubkey,
  pub entity_key: Vec<u8>,
  pub bump_seed: u8,
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
}
pub const IOT_HOTSPOT_INFO_SIZE: usize = 8 +
    32 + // asset
    1 + // bump
    1 + 8 + // location
    1 + 4 + // elevation
    1 + 4 +// gain
    1 + // is full hotspot
    2 + // num location assers
    60; // pad

#[account]
#[derive(Default)]
pub struct MobileHotspotInfoV0 {
  pub asset: Pubkey,
  pub bump_seed: u8,

  pub location: Option<u64>,
  pub is_full_hotspot: bool,
  pub num_location_asserts: u16,
}
pub const MOBILE_HOTSPOT_INFO_SIZE: usize = 8 +
    32 + // asset
    1 + // bump
    1 + 8 + // location
    1 + // is full hotspot
    2 + // num location assers
    60; // pad
