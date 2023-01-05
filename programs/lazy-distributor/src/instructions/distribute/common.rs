use crate::error::ErrorCode;
use crate::{LazyDistributorV0, RecipientV0};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::TransferV0, transfer_v0},
  AccountWindowedCircuitBreakerV0, CircuitBreaker, TransferArgsV0,
};

#[derive(Accounts)]
pub struct DistributeRewardsCommonV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    has_one = rewards_mint,
    has_one = rewards_escrow
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor,
    constraint = recipient.current_rewards.iter().flatten().count() >= ((lazy_distributor.oracles.len() + 1) / 2)
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  pub rewards_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), rewards_escrow.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  /// TODO: Should this be permissioned? Should the owner have to sign to receive rewards?
  /// CHECK: Just required for ATA
  pub owner: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = rewards_mint,
    associated_token::authority = owner,
  )]
  pub destination_account: Box<Account<'info, TokenAccount>>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
}

pub fn distribute_impl(ctx: &mut DistributeRewardsCommonV0) -> Result<()> {
  let seeds: &[&[&[u8]]] = &[&[
    b"lazy_distributor",
    ctx.lazy_distributor.rewards_mint.as_ref(),
    &[ctx.lazy_distributor.bump_seed],
  ]];
  let recipient = &mut ctx.recipient;
  let mut filtered: Vec<u64> = recipient
    .current_rewards
    .clone()
    .into_iter()
    .flatten()
    .collect();
  filtered.sort_unstable();
  let median_idx = filtered.len() / 2;
  let median = filtered[median_idx];

  recipient.current_rewards = vec![None; ctx.lazy_distributor.oracles.len()];
  let to_dist = median
    .checked_sub(recipient.total_rewards)
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;
  recipient.total_rewards = median;

  transfer_v0(
    CpiContext::new_with_signer(
      ctx.token_program.to_account_info().clone(),
      TransferV0 {
        from: ctx.rewards_escrow.to_account_info().clone(),
        to: ctx.destination_account.to_account_info().clone(),
        owner: ctx.lazy_distributor.to_account_info().clone(),
        circuit_breaker: ctx.circuit_breaker.to_account_info().clone(),
        token_program: ctx.token_program.to_account_info().clone(),
      },
      seeds,
    ),
    TransferArgsV0 { amount: to_dist },
  )?;

  Ok(())
}
