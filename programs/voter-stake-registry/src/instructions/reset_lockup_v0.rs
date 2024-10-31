use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::{error::*, state::*};

#[derive(Accounts)]
pub struct ResetLockupV0<'info> {
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: Checked conditionally based on registrar
  #[account(
    constraint = registrar.position_update_authority.map(|k|
      k == *position_update_authority.key
    ).unwrap_or(true) @ VsrError::UnauthorizedPositionUpdateAuthority,
  )]
  pub position_update_authority: Signer<'info>,
  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = position.bump_seed,
    has_one = registrar,
    has_one = mint,
    constraint = !position.is_frozen() @ VsrError::PositionFrozen
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub position_authority: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ResetLockupArgsV0 {
  pub kind: LockupKind,
  pub periods: u32,
}

/// Resets a lockup to start at the current slot timestamp and to last for
/// `periods`, which must be >= the number of periods left on the lockup.
/// This will re-lock any non-withdrawn vested funds.
pub fn handler(ctx: Context<ResetLockupV0>, args: ResetLockupArgsV0) -> Result<()> {
  let ResetLockupArgsV0 { kind, periods } = args;

  let registrar = &ctx.accounts.registrar;
  let position = &mut ctx.accounts.position;
  let curr_ts = registrar.clock_unix_timestamp();

  let mint_idx = position.voting_mint_config_idx;
  let mint_config = &registrar.voting_mints[mint_idx as usize];

  let new_seconds = (periods as u64).checked_mul(kind.period_secs()).unwrap();
  // Can't lock more than 4 years
  if new_seconds > mint_config.lockup_saturation_secs {
    return Err(VsrError::InvalidLockupPeriod.into());
  }

  // Must not decrease duration or strictness
  require_gte!(
    new_seconds,
    position.lockup.seconds_left(curr_ts),
    VsrError::InvalidLockupPeriod
  );
  require_gte!(
    kind.strictness(),
    position.lockup.kind.strictness(),
    VsrError::InvalidLockupKind
  );

  // Change the deposit entry.
  position.lockup = Lockup::new_from_periods(kind, curr_ts, curr_ts, periods)?;
  if curr_ts <= mint_config.genesis_vote_power_multiplier_expiration_ts {
    position.genesis_end = i64::try_from(position.lockup.seconds_left(curr_ts)).unwrap() + curr_ts;
  }

  Ok(())
}
