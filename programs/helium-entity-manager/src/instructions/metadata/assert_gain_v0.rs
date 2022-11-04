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

pub fn handler(ctx: Context<AssertGainV0>, args: AssertGainArgsV0) -> Result<()> {
  let storage = &mut ctx.accounts.storage;
  storage.gain = Some(args.gain);
  storage.gain_asserted = true;
  Ok(())
}
