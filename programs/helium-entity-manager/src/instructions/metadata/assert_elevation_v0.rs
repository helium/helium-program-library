use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AssertElevationArgsV0 {
  pub elevation: i32,
}

#[derive(Accounts)]
#[instruction(args: AssertElevationArgsV0)]
pub struct AssertElevationV0<'info> {
  #[account(
    seeds = [
      "hotspot".as_bytes(),
      &storage.ecc_compact,
    ],
    bump
  )]
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
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
    constraint = owner_ata.amount == 1,
  )]
  pub owner_ata: Box<Account<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<AssertElevationV0>, args: AssertElevationArgsV0) -> Result<()> {
  let storage = &mut ctx.accounts.storage;
  storage.elevation = Some(args.elevation);
  storage.elevation_asserted = true;
  Ok(())
}
