use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");

#[derive(Accounts)]
pub struct TempCloseRecipientV0<'info> {
  #[account(address = AUTHORITY)]
  pub authority: Signer<'info>,
  pub approver: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    close = authority,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TempCloseRecipientV0>) -> Result<()> {
  if let Some(approver_pubkey) = ctx.accounts.lazy_distributor.approver {
    require!(
      ctx.accounts.approver.key() == approver_pubkey,
      ErrorCode::InvalidApproverSignature
    );
  }

  // Note: KeyToAssetV0 verification is done by the calling program (rewards-oracle)
  // before this instruction is invoked. The rewards_oracle_signer ensures this instruction
  // can only be called through the rewards-oracle wrapper program.
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
