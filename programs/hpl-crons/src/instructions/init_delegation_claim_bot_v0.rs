use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use helium_sub_daos::DelegatedPositionV0;
use tuktuk_program::TaskQueueV0;
use voter_stake_registry::state::PositionV0;

use crate::DelegationClaimBotV0;

#[derive(Accounts)]
pub struct InitDelegationClaimBotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    seeds = [b"delegation_claim_bot", task_queue.key().as_ref(), delegated_position.key().as_ref()],
    bump,
    space = 8 + 60 + DelegationClaimBotV0::INIT_SPACE,
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

pub fn handler(ctx: Context<InitDelegationClaimBotV0>) -> Result<()> {
  ctx
    .accounts
    .delegation_claim_bot
    .set_inner(DelegationClaimBotV0 {
      delegated_position: ctx.accounts.delegated_position.key(),
      task_queue: ctx.accounts.task_queue.key(),
      bump_seed: ctx.bumps.delegation_claim_bot,
      rent_refund: ctx.accounts.payer.key(),
      last_claimed_epoch: ctx.accounts.delegated_position.last_claimed_epoch,
      queued: false,
      next_task: Pubkey::default(),
    });
  Ok(())
}
