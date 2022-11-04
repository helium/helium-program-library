use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AssertGainArgsV0 {
  pub gain: i32,
}

#[derive(Accounts)]
#[instruction(args: AssertGainArgsV0)]
pub struct AssertGainV0<'info> {
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

  #[account(
    seeds = ["hotspot_config".as_bytes(), hotspot_config.sub_dao.as_ref(), hotspot_config.symbol.as_bytes()],
    bump,
    constraint = args.gain <= hotspot_config.max_gain && args.gain >= hotspot_config.min_gain @ ErrorCode::InvalidGain
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,
}

pub fn handler(ctx: Context<AssertGainV0>, args: AssertGainArgsV0) -> Result<()> {
  let storage = &mut ctx.accounts.storage;
  storage.gain = Some(args.gain);
  storage.gain_asserted = true;
  Ok(())
}
