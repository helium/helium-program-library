use anchor_lang::prelude::*;

#[account]
#[derive(Default, InitSpace)]
pub struct IotRoutingManagerV0 {
  pub sub_dao: Pubkey,
  pub iot_mint: Pubkey,
  pub iot_price_oracle: Pubkey,
  pub update_authority: Pubkey,
  pub net_id_authority: Pubkey,
  pub collection: Pubkey, // The metaplex collection to be issued for Rewardable Entities
  // with 6 decimals of precision
  pub devaddr_price_usd: u64,
  pub oui_price_usd: u64,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! routing_manager_seeds {
  ( $manager:expr ) => {
    &[
      b"routing_manager".as_ref(),
      $manager.sub_dao.as_ref(),
      &[$manager.bump_seed],
    ]
  };
}

#[account]
#[derive(Default)]
pub struct OrganizationV0 {
  pub routing_manager: Pubkey,
  pub net_id: Pubkey,
  pub authority: Pubkey,
  pub oui: u64,
  pub escrow_key: String,
  pub approved: bool,
  pub locked: bool,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! organization_seeds {
  ( $org:expr ) => {
    &[
      b"organization".as_ref(),
      $org.routing_manager.as_ref(),
      &$org.oui.to_le_bytes()[..],
      &[$org.bump_seed],
    ]
  };
}

#[account]
#[derive(Default, InitSpace)]
pub struct NetIdV0 {
  pub routing_manager: Pubkey,
  pub id: u64,
  pub authority: Pubkey,
  pub current_addr_offset: u64,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! net_id_seeds {
  ( $net_id:expr ) => {
    &[
      b"net_id".as_ref(),
      $net_id.routing_manager.as_ref(),
      &$net_id.id.to_le_bytes()[..],
      &[$net_id.bump_seed],
    ]
  };
}

#[account]
#[derive(Default, InitSpace)]
pub struct DevAddrConstraintV0 {
  pub routing_manager: Pubkey,
  pub net_id: Pubkey,
  pub organization: Pubkey,
  pub start_addr: u64,
  pub end_addr: u64,
  pub bump_seed: u8,
}

#[account]
#[derive(Default, InitSpace)]
pub struct OrganizationDelegateV0 {
  pub organization: Pubkey,
  pub delegate: Pubkey,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! organization_delegate_seeds {
  ( $delegate:expr ) => {
    &[
      b"organization_delegate".as_ref(),
      $delegate.organization.as_ref(),
      $delegate.delegate.as_ref(),
      &[$delegate.bump_seed],
    ]
  };
}
