use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use std::str::FromStr;

use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize, Discriminator};

#[account]
pub struct OldMobileHotspotInfo {
  pub asset: Pubkey,
  pub bump_seed: u8,

  pub location: Option<u64>,
  pub is_full_hotspot: bool,
  pub num_location_asserts: u16,
  pub is_active: bool,
  pub dc_onboarding_fee_paid: u64,
  pub device_type: MobileDeviceTypeV0,
}

const FIX_DEPLOYER_KEY: &str = "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW";
#[derive(Accounts)]
pub struct TempRepairMobileHotspotInfo<'info> {
  /// CHECK: no
  #[account(mut)]
  pub mobile_info: UncheckedAccount<'info>,
  #[account(
    constraint = authority.key() == Pubkey::from_str(FIX_DEPLOYER_KEY).unwrap(),
  )]
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TempRepairMobileHotspotInfo>) -> Result<()> {
  let mut data = ctx.accounts.mobile_info.try_borrow_mut_data()?;
  let old_info: OldMobileHotspotInfo =
    OldMobileHotspotInfo::try_deserialize_unchecked(&mut &data[..])?;
  let old_info_bytes = old_info.try_to_vec()?;
  for byte in &mut data[(8 + old_info_bytes.len())..] {
    *byte = 0;
  }

  msg!("Repaired, checking...");
  let new_info: MobileHotspotInfoV0 = MobileHotspotInfoV0::try_deserialize(&mut &data[..])?;

  require_eq!(new_info.asset, old_info.asset);
  require_eq!(new_info.bump_seed, old_info.bump_seed);
  require_eq!(new_info.location.is_some(), old_info.location.is_some());
  if new_info.location.is_some() {
    require_eq!(new_info.location.unwrap(), old_info.location.unwrap());
  }
  require_eq!(new_info.is_full_hotspot, old_info.is_full_hotspot);
  require_eq!(new_info.num_location_asserts, old_info.num_location_asserts);
  require_eq!(new_info.is_active, old_info.is_active);
  require_eq!(
    new_info.dc_onboarding_fee_paid,
    old_info.dc_onboarding_fee_paid
  );
  if new_info.device_type != old_info.device_type {
    return Err(ErrorCode::InvalidDeviceType.into());
  }

  Ok(())
}
