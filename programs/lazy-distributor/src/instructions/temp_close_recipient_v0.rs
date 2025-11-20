use anchor_lang::prelude::*;

use crate::state::*;

const AUTHORITY: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");

#[derive(Accounts)]
pub struct TempCloseRecipientV0<'info> {
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
  /// Rewards oracle PDA signer - ensures this can only be called through rewards-oracle
  #[account(
    seeds = [b"oracle_signer"],
    seeds::program = rewards_oracle::ID,
    bump
  )]
  pub rewards_oracle_signer: Signer<'info>,
  /// Optional approver - must sign if lazy_distributor.approver is set
  pub approver: Option<Signer<'info>>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    close = rent_receiver,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  /// CHECK: Receives the rent refund
  #[account(mut)]
  pub rent_receiver: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<TempCloseRecipientV0>) -> Result<()> {
  // Verify approver signature if required
  if let Some(approver_pubkey) = ctx.accounts.lazy_distributor.approver {
    require!(
      ctx.accounts.approver.is_some(),
      crate::error::ErrorCode::MissingApprover
    );
    require!(
      ctx.accounts.approver.as_ref().unwrap().key() == approver_pubkey,
      crate::error::ErrorCode::InvalidApprover
    );
  }

  // Note: KeyToAssetV0 verification is done by the calling program (rewards-oracle)
  // before this instruction is invoked. The rewards_oracle_signer ensures this instruction
  // can only be called through the rewards-oracle wrapper program.
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
