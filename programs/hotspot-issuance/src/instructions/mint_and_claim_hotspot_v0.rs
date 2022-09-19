use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MintAndClaimHotspotV0Args {
  pub authority: Pubkey
}

#[derive(Accounts)]
pub struct MintAndClaimHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
}