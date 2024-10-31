use anchor_lang::prelude::*;
use shared_utils::resize_to_fit;
use voter_stake_registry::state::Registrar;

use crate::state::{VeTokenTrackerV0, VotingRewardsTierV0};

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct UpdateVeTokenTrackerArgsV0 {
  pub voting_rewards_tiers: Option<Vec<VotingRewardsTierV0>>,
}
#[derive(Accounts)]
pub struct UpdateVeTokenTrackerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut, has_one = registrar)]
  pub vetoken_tracker: Account<'info, VeTokenTrackerV0>,
  #[account(
    has_one = realm_authority
  )]
  pub registrar: Account<'info, Registrar>,
  pub realm_authority: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<UpdateVeTokenTrackerV0>,
  args: UpdateVeTokenTrackerArgsV0,
) -> Result<()> {
  if let Some(voting_rewards_tiers) = args.voting_rewards_tiers {
    ctx.accounts.vetoken_tracker.voting_rewards_tiers = voting_rewards_tiers;
  }

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.vetoken_tracker,
  )?;

  Ok(())
}
