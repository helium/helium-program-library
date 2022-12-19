use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InternalTransferLocked<'info> {
  pub registrar: AccountLoader<'info, Registrar>,

  // checking the PDA address it just an extra precaution,
  // the other constraints must be exhaustive
  #[account(
        mut,
        seeds = [registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
        bump = voter.load()?.voter_bump,
        has_one = voter_authority,
        has_one = registrar)]
  pub voter: AccountLoader<'info, Voter>,
  pub voter_authority: Signer<'info>,
}

/// Transfers locked tokens from the source deposit entry to the target deposit entry.
///
/// The target deposit entry must have equal or longer lockup period, and be of a kind
/// that is at least equally strict.
///
/// Note that this never transfers withdrawable tokens, only tokens that are still
/// locked up.
///
/// The primary usecases are:
/// - consolidating multiple small deposit entries into a single big one for cleanup
/// - transfering a small part of a big "constant" lockup deposit entry into a "cliff"
///   locked deposit entry to start the unlocking process (reset_lockup could only
///   change the whole deposit entry to "cliff")
pub fn internal_transfer_locked(
  ctx: Context<InternalTransferLocked>,
  source_deposit_entry_index: u8,
  target_deposit_entry_index: u8,
  amount: u64,
) -> Result<()> {
  let registrar = &ctx.accounts.registrar.load()?;
  let voter = &mut ctx.accounts.voter.load_mut()?;
  let curr_ts = registrar.clock_unix_timestamp();

  let source = voter.active_deposit_mut(source_deposit_entry_index)?;
  source.resolve_vesting(curr_ts)?;
  let source_seconds_left = source.lockup.seconds_left(curr_ts);
  let source_strictness = source.lockup.kind.strictness();
  let source_mint_idx = source.voting_mint_config_idx;

  // Reduce source amounts
  require_gte!(
    source.amount_initially_locked_native,
    amount,
    VsrError::InsufficientLockedTokens
  );
  source.amount_deposited_native = source.amount_deposited_native.checked_sub(amount).unwrap();
  source.amount_initially_locked_native =
    source.amount_initially_locked_native.saturating_sub(amount);

  // Check target compatibility
  let target = voter.active_deposit_mut(target_deposit_entry_index)?;
  target.resolve_vesting(curr_ts)?;
  require_eq!(
    target.voting_mint_config_idx,
    source_mint_idx,
    VsrError::InvalidMint
  );
  require_gte!(
    target.lockup.seconds_left(curr_ts),
    source_seconds_left,
    VsrError::InvalidLockupPeriod
  );
  require_gte!(
    target.lockup.kind.strictness(),
    source_strictness,
    VsrError::InvalidLockupKind
  );

  // Add target amounts
  target.amount_deposited_native = target.amount_deposited_native.checked_add(amount).unwrap();
  target.amount_initially_locked_native = target
    .amount_initially_locked_native
    .checked_add(amount)
    .unwrap();

  Ok(())
}
