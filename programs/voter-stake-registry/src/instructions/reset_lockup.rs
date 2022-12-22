use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct ResetLockup<'info> {
  pub registrar: AccountLoader<'info, Registrar>,

  // checking the PDA address it just an extra precaution,
  // the other constraints must be exhaustive
  #[account(
    mut,
    seeds = [registrar.key().as_ref(), b"voter".as_ref(), mint.key().as_ref()],
    bump = voter.load()?.voter_bump,
    has_one = registrar,
    has_one = mint
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

/// Resets a lockup to start at the current slot timestamp and to last for
/// `periods`, which must be >= the number of periods left on the lockup.
/// This will re-lock any non-withdrawn vested funds.
pub fn reset_lockup(
  ctx: Context<ResetLockup>,
  deposit_entry_index: u8,
  kind: LockupKind,
  periods: u32,
) -> Result<()> {
  let registrar = &ctx.accounts.registrar.load()?;
  let voter = &mut ctx.accounts.voter.load_mut()?;
  let curr_ts = registrar.clock_unix_timestamp();

  let source = voter.active_deposit_mut(deposit_entry_index)?;

  // Must not decrease duration or strictness
  require_gte!(
    (periods as u64).checked_mul(kind.period_secs()).unwrap(),
    source.lockup.seconds_left(curr_ts),
    VsrError::InvalidLockupPeriod
  );
  require_gte!(
    kind.strictness(),
    source.lockup.kind.strictness(),
    VsrError::InvalidLockupKind
  );

  // Change the deposit entry.
  let d_entry = voter.active_deposit_mut(deposit_entry_index)?;
  d_entry.lockup = Lockup::new_from_periods(kind, curr_ts, curr_ts, periods)?;

  Ok(())
}
