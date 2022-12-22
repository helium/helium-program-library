use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct CloseDepositEntry<'info> {
  // checking the PDA address it just an extra precaution,
  // the other constraints must be exhaustive
  #[account(
    mut,
    seeds = [b"voter".as_ref(), mint.key().as_ref()],
    bump = voter.load()?.voter_bump,
    has_one = mint,
  )]
  pub voter: AccountLoader<'info, Voter>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = voter_authority,
    constraint = voter_token_account.amount > 0
  )]
  pub voter_token_account: Box<Account<'info, TokenAccount>>,
  pub voter_authority: Signer<'info>,
}

/// Close an empty deposit entry, allowing it to be reused in the future.
///
/// Deposit entries can only be closed when they don't hold any tokens.
pub fn close_deposit_entry(ctx: Context<CloseDepositEntry>, deposit_entry_index: u8) -> Result<()> {
  let voter = &mut ctx.accounts.voter.load_mut()?;
  let d = voter.active_deposit_mut(deposit_entry_index)?;
  require_eq!(d.amount_deposited_native, 0, VsrError::VotingTokenNonZero);

  *d = DepositEntry::default();
  d.is_used = false;

  Ok(())
}
