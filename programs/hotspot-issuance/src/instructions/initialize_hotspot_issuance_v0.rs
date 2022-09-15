use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotIssuanceV0Args {
  pub collection: Pubkey,
  pub authority: Pubkey
}

#[derive(Accounts)]
pub struct InitializeHotspotIssuanceV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
}
