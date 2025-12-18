use anchor_lang::prelude::*;

use crate::state::*;

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");
const REWARDS_ORACLE_PROGRAM: Pubkey = pubkey!("rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF");

#[derive(Accounts)]
pub struct TempCloseRecipientV0<'info> {
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
  /// Rewards oracle PDA signer - ensures this can only be called through rewards-oracle
  #[account(
    seeds = [b"oracle_signer"],
    seeds::program = REWARDS_ORACLE_PROGRAM,
    bump
  )]
  pub rewards_oracle_signer: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    close = authority,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
}

pub fn handler(ctx: Context<TempCloseRecipientV0>) -> Result<()> {
  // Note: KeyToAssetV0 verification is done by the calling program (rewards-oracle)
  // before this instruction is invoked. The rewards_oracle_signer ensures this instruction
  // can only be called through the rewards-oracle wrapper program.
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
