use std::array;

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use voter_stake_registry::state::Registrar;

use crate::state::{RecentProposal, VeTokenTrackerV0, VotingRewardsTierV0};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeVeTokenTrackerArgsV0 {
  pub voting_rewards_tiers: Vec<VotingRewardsTierV0>,
}

#[derive(Accounts)]
pub struct InitializeVeTokenTrackerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + VeTokenTrackerV0::INIT_SPACE,
    seeds = ["vetoken_tracker".as_bytes(), registrar.key().as_ref()],
    bump,
  )]
  pub vetoken_tracker: Account<'info, VeTokenTrackerV0>,
  /// CHECK: Check not needed
  pub proposal_namespace: UncheckedAccount<'info>,
  #[account(
    has_one = realm_authority,
  )]
  pub registrar: Account<'info, Registrar>,
  pub rewards_mint: Account<'info, Mint>,
  pub realm_authority: Signer<'info>,
  /// CHECK: Just an argument
  pub rewards_authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeVeTokenTrackerV0>,
  args: InitializeVeTokenTrackerArgsV0,
) -> Result<()> {
  ctx.accounts.vetoken_tracker.set_inner(VeTokenTrackerV0 {
    proposal_namespace: ctx.accounts.proposal_namespace.key(),
    registrar: ctx.accounts.registrar.key(),
    rewards_authority: ctx.accounts.rewards_authority.key(),
    rewards_mint: ctx.accounts.rewards_mint.key(),
    vetoken_last_calculated_ts: ctx.accounts.registrar.clock_unix_timestamp(),
    vetoken_fall_rate: 0,
    total_vetokens: 0,
    recent_proposals: array::from_fn(|_| RecentProposal::default()),
    bump_seed: ctx.bumps["vetoken_tracker"],
    voting_rewards_tiers: args.voting_rewards_tiers,
  });
  Ok(())
}
