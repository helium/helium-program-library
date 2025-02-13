use anchor_lang::prelude::*;

use crate::{current_epoch, helium_sub_daos::helium_sub_daos::accounts::DaoV0, EpochTrackerV0};

#[derive(Accounts)]
pub struct InitEpochTracker<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    seeds = [b"epoch_tracker", dao.key().as_ref()],
    bump,
    space = 8 + EpochTrackerV0::INIT_SPACE + 60,
  )]
  pub epoch_tracker: Box<Account<'info, EpochTrackerV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  /// CHECK: The authority to set
  pub authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitEpochTracker>) -> Result<()> {
  ctx.accounts.epoch_tracker.set_inner(EpochTrackerV0 {
    dao: ctx.accounts.dao.key(),
    epoch: current_epoch(Clock::get().unwrap().unix_timestamp) - 1,
    bump_seed: ctx.bumps.epoch_tracker,
    authority: ctx.accounts.authority.key(),
  });
  Ok(())
}
