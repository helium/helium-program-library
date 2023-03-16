use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::TokenAccount;
use voter_stake_registry::state::LockupKind as VsrLockupKind;
use voter_stake_registry::{
  cpi::{accounts::ResetLockupV0 as VsrResetLockupV0, reset_lockup_v0},
  state::{PositionV0, Registrar},
  ResetLockupArgsV0 as VsrResetLockupArgsV0, VoterStakeRegistry,
};

#[derive(Accounts)]
pub struct ResetLockupV0<'info> {
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = position.bump_seed,
    seeds::program = vsr_program.key(),
    has_one = registrar,
    has_one = mint
  )]
  pub position: Box<Account<'info, PositionV0>>,
  /// CHECK: This account needs to be closed. You can't reset_lockup while delegated
  #[account(
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    bump,
    constraint = delegated_position.data_is_empty() && delegated_position.lamports() == 0 @ ErrorCode::PositionChangeWhileDelegated
  )]
  pub delegated_position: UncheckedAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub position_authority: Signer<'info>,
  pub vsr_program: Program<'info, VoterStakeRegistry>,
}

#[repr(u8)]
#[derive(Default, AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockupKind {
  /// No lockup, tokens can be withdrawn as long as not engaged in a proposal.
  #[default]
  None,

  /// Lock up for a number of days
  Cliff,

  /// Lock up permanently. The number of days specified becomes the minimum
  /// unlock period when the deposit (or a part of it) is changed to Cliff.
  Constant,
}

impl From<LockupKind> for VsrLockupKind {
  fn from(kind: LockupKind) -> Self {
    match kind {
      LockupKind::None => VsrLockupKind::None,
      LockupKind::Cliff => VsrLockupKind::Cliff,
      LockupKind::Constant => VsrLockupKind::Constant,
    }
  }
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

  reset_lockup_v0(
    CpiContext::new_with_signer(
      ctx.accounts.vsr_program.to_account_info(),
      VsrResetLockupV0 {
        registrar: ctx.accounts.registrar.to_account_info(),
        position_update_authority: ctx.accounts.dao.to_account_info(),
        position: ctx.accounts.position.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        position_token_account: ctx.accounts.position_token_account.to_account_info(),
        position_authority: ctx.accounts.position_authority.to_account_info(),
      },
      &[&[
        b"dao",
        ctx.accounts.dao.hnt_mint.key().as_ref(),
        &[ctx.accounts.dao.bump_seed],
      ]],
    ),
    VsrResetLockupArgsV0 {
      kind: kind.into(),
      periods,
    },
  )?;

  Ok(())
}
