use anchor_lang::prelude::*;

use crate::EpochTrackerV0;
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateEpochTrackerArgs {
  pub epoch: Option<u64>,
  pub authority: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateEpochTracker<'info> {
  pub authority: Signer<'info>,
  #[account(mut, has_one = authority)]
  pub epoch_tracker: Box<Account<'info, EpochTrackerV0>>,
}

pub fn handler(ctx: Context<UpdateEpochTracker>, args: UpdateEpochTrackerArgs) -> Result<()> {
  if let Some(epoch) = args.epoch {
    ctx.accounts.epoch_tracker.epoch = epoch;
  }
  if let Some(authority) = args.authority {
    ctx.accounts.epoch_tracker.authority = authority;
  }

  Ok(())
}
