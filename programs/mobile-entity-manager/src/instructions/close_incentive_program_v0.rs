use anchor_lang::prelude::*;

use crate::{error::ErrorCode, state::*};

/// Retires an incentive escrow program once its window has passed.
///
/// The account is a PDA of its carrier, so it must be retired while the carrier still exists;
/// afterwards nothing can reach it.
#[derive(Accounts)]
pub struct CloseIncentiveProgramV0<'info> {
  pub issuing_authority: Signer<'info>,
  #[account(has_one = issuing_authority)]
  pub carrier: Box<Account<'info, CarrierV0>>,
  /// CHECK: Receives the rent of the account this closes.
  #[account(mut)]
  pub rent_refund: SystemAccount<'info>,
  #[account(
    mut,
    close = rent_refund,
    has_one = carrier,
    constraint = Clock::get()?.unix_timestamp > incentive_escrow_program.stop_ts
      @ ErrorCode::IncentiveProgramNotEnded,
  )]
  pub incentive_escrow_program: Box<Account<'info, IncentiveEscrowProgramV0>>,
}

pub fn handler(_ctx: Context<CloseIncentiveProgramV0>) -> Result<()> {
  Ok(())
}
