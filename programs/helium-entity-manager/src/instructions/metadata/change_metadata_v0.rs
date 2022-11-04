use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ChangeMetadataArgsV0 {
  pub location: Option<String>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
}

#[derive(Accounts)]
#[instruction(args: ChangeMetadataArgsV0)]
pub struct ChangeMetadataV0<'info> {
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
    mut,
    seeds = [
      "storage".as_bytes(),
      hotspot.key().as_ref()
    ],
    bump
  )]
  pub storage: Box<Account<'info, HotspotStorageV0>>,
  pub hotspot_owner: Signer<'info>,
  #[account(
    associated_token::mint = hotspot,
    associated_token::authority = hotspot_owner,
    constraint = owner_hotspot_ata.amount == 1,
  )]
  pub owner_hotspot_ata: Box<Account<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<ChangeMetadataV0>, args: ChangeMetadataArgsV0) -> Result<()> {
  let storage = &mut ctx.accounts.storage;
  if args.location.is_some() {
    storage.location = args.location;
    storage.location_asserted = false;
  }
  if args.elevation.is_some() {
    storage.elevation = args.elevation;
    storage.elevation_asserted = false;
  }
  if args.gain.is_some() {
    storage.gain = args.gain;
    storage.gain_asserted = false;
  }
  Ok(())
}
