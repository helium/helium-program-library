use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeHotspotIssuerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>
}
