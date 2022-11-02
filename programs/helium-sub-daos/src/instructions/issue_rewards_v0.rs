use crate::{current_epoch, error::ErrorCode, state::*, OrArithError, TESTING};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use shared_utils::precise_number::{InnerUint, PreciseNumber};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: IssueRewardsArgsV0)]
pub struct IssueRewardsV0<'info> {
  #[account(
    has_one = hnt_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    has_one = treasury,
    has_one = dnt_mint,
    has_one = rewards_escrow
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dao,
    constraint = dao_epoch_info.num_utility_scores_calculated >= dao.num_sub_daos @ ErrorCode::MissingUtilityScores,
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = dao_epoch_info.bump_seed,
    constraint = !dao_epoch_info.done_issuing_rewards
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    has_one = sub_dao,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = sub_dao_epoch_info.bump_seed,
    constraint = TESTING || !sub_dao_epoch_info.rewards_issued
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = hnt_circuit_breaker.bump_seed
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = dnt_circuit_breaker.bump_seed
  )]
  pub dnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub treasury: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub clock: Sysvar<'info, Clock>,
}

fn to_prec(n: Option<u128>) -> Option<PreciseNumber> {
  Some(PreciseNumber {
    value: InnerUint::from(n?),
  })
}

pub fn handler(ctx: Context<IssueRewardsV0>, args: IssueRewardsArgsV0) -> Result<()> {
  let epoch = current_epoch(ctx.accounts.clock.unix_timestamp);

  if !TESTING && args.epoch >= epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  let utility_score = to_prec(ctx.accounts.sub_dao_epoch_info.utility_score)
    .ok_or_else(|| error!(ErrorCode::NoUtilityScore))?;
  let total_utility_score = to_prec(Some(ctx.accounts.dao_epoch_info.total_utility_score))
    .ok_or_else(|| error!(ErrorCode::NoUtilityScore))?;

  let percent_share = utility_score
    .checked_div(&total_utility_score)
    .or_arith_error()?;
  let emissions = ctx
    .accounts
    .dao
    .emission_schedule
    .get_emissions_at(ctx.accounts.clock.unix_timestamp)
    .unwrap();
  let total_rewards = PreciseNumber::new(emissions.into()).or_arith_error()?;
  let rewards_prec = percent_share.checked_mul(&total_rewards).or_arith_error()?;
  let rewards_amount: u64 = rewards_prec
    .floor() // Ensure we never overspend the defined rewards
    .or_arith_error()?
    .to_imprecise()
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
    .try_into()
    .unwrap();

  mint_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      MintV0 {
        mint: ctx.accounts.dnt_mint.to_account_info(),
        to: ctx.accounts.rewards_escrow.to_account_info(),
        mint_authority: ctx.accounts.sub_dao.to_account_info(),
        circuit_breaker: ctx.accounts.dnt_circuit_breaker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        clock: ctx.accounts.clock.to_account_info(),
      },
      &[&[
        b"sub_dao",
        ctx.accounts.dnt_mint.key().as_ref(),
        &[ctx.accounts.sub_dao.bump_seed],
      ]],
    ),
    MintArgsV0 {
      amount: ctx
        .accounts
        .sub_dao
        .emission_schedule
        .get_emissions_at(ctx.accounts.clock.unix_timestamp)
        .unwrap(),
    },
  )?;

  mint_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      MintV0 {
        mint: ctx.accounts.hnt_mint.to_account_info(),
        to: ctx.accounts.treasury.to_account_info(),
        mint_authority: ctx.accounts.dao.to_account_info(),
        circuit_breaker: ctx.accounts.hnt_circuit_breaker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        clock: ctx.accounts.clock.to_account_info(),
      },
      &[&[
        b"dao",
        ctx.accounts.hnt_mint.key().as_ref(),
        &[ctx.accounts.dao.bump_seed],
      ]],
    ),
    MintArgsV0 {
      amount: rewards_amount,
    },
  )?;

  ctx.accounts.dao_epoch_info.num_rewards_issued += 1;
  ctx.accounts.sub_dao_epoch_info.rewards_issued = true;
  ctx.accounts.dao_epoch_info.done_issuing_rewards =
    ctx.accounts.dao.num_sub_daos == ctx.accounts.dao_epoch_info.num_rewards_issued;

  Ok(())
}
