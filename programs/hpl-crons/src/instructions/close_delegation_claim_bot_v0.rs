use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use helium_sub_daos::DelegatedPositionV0;
use tuktuk_program::TaskQueueV0;
use voter_stake_registry::state::PositionV0;

use crate::DelegationClaimBotV0;

#[derive(Accounts)]
pub struct CloseDelegationClaimBotV0<'info> {
  #[account(mut)]
  /// CHECK: Doesn't matter
  pub rent_refund: AccountInfo<'info>,
  #[account(
    mut,
    has_one = task_queue,
    has_one = delegated_position,
    has_one = rent_refund,
    seeds = [b"delegation_claim_bot", task_queue.key().as_ref(), delegated_position.key().as_ref()],
    bump = delegation_claim_bot.bump_seed,
    close = rent_refund
  )]
  pub delegation_claim_bot: Box<Account<'info, DelegationClaimBotV0>>,
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    has_one = position,
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    has_one = mint,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub position_authority: Signer<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(_: Context<CloseDelegationClaimBotV0>) -> Result<()> {
  Ok(())
}
