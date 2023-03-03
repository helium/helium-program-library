use crate::{current_epoch, error::ErrorCode, state::*, OrArithError, TESTING};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use clockwork_sdk::state::{ThreadResponse, Trigger};
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
    mut,
    has_one = dao,
    has_one = treasury,
    has_one = dnt_mint,
    has_one = rewards_escrow,
    has_one = delegator_pool,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    has_one = dao,
    constraint = dao_epoch_info.num_utility_scores_calculated >= dao.num_sub_daos @ ErrorCode::MissingUtilityScores,
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = dao_epoch_info.bump_seed,
    constraint = !dao_epoch_info.done_issuing_rewards
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    mut,
    has_one = sub_dao,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = sub_dao_epoch_info.bump_seed,
    constraint = TESTING || sub_dao_epoch_info.rewards_issued_at.is_none()
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
  #[account(mut)]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

fn to_prec(n: Option<u128>) -> Option<PreciseNumber> {
  Some(PreciseNumber {
    value: InnerUint::from(n?),
  })
}

impl<'info> IssueRewardsV0<'info> {
  pub fn mint_dnt_emissions_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    let cpi_accounts = MintV0 {
      mint: self.dnt_mint.to_account_info(),
      to: self.rewards_escrow.to_account_info(),
      mint_authority: self.sub_dao.to_account_info(),
      circuit_breaker: self.dnt_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  pub fn mint_delegation_rewards_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    let cpi_accounts = MintV0 {
      mint: self.dnt_mint.to_account_info(),
      to: self.delegator_pool.to_account_info(),
      mint_authority: self.sub_dao.to_account_info(),
      circuit_breaker: self.dnt_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  pub fn mint_treasury_emissions_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    let cpi_accounts = MintV0 {
      mint: self.hnt_mint.to_account_info(),
      to: self.treasury.to_account_info(),
      mint_authority: self.dao.to_account_info(),
      circuit_breaker: self.hnt_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<IssueRewardsV0>, args: IssueRewardsArgsV0) -> Result<ThreadResponse> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts);

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
  let total_emissions = ctx.accounts.dao_epoch_info.total_rewards;
  let percent = ctx
    .accounts
    .dao
    .hst_emission_schedule
    .get_percent_at(curr_ts)
    .unwrap();
  // Subdaos get the remainder after hst
  let emissions = 100_u64
    .checked_sub(percent.into())
    .unwrap()
    .checked_mul(total_emissions)
    .unwrap()
    .checked_div(100)
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

  let total_emissions = ctx
    .accounts
    .sub_dao
    .emission_schedule
    .get_emissions_at(Clock::get()?.unix_timestamp)
    .unwrap();

  let delegators_present = ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start > 0;
  mint_v0(
    ctx.accounts.mint_dnt_emissions_ctx().with_signer(&[&[
      b"sub_dao",
      ctx.accounts.dnt_mint.key().as_ref(),
      &[ctx.accounts.sub_dao.bump_seed],
    ]]),
    MintArgsV0 {
      amount: total_emissions
        .checked_mul(94)
        .unwrap()
        .checked_div(100)
        .unwrap(), // 94% of emissions are sent to treasury
    },
  )?;

  let delegation_rewards_amount = if delegators_present {
    total_emissions
      .checked_mul(6)
      .unwrap()
      .checked_div(100)
      .unwrap()
  } else {
    0
  };

  mint_v0(
    ctx.accounts.mint_delegation_rewards_ctx().with_signer(&[&[
      b"sub_dao",
      ctx.accounts.dnt_mint.key().as_ref(),
      &[ctx.accounts.sub_dao.bump_seed],
    ]]),
    MintArgsV0 {
      amount: delegation_rewards_amount, // 6% of emissions are sent to delegation pool
    },
  )?;

  mint_v0(
    ctx.accounts.mint_treasury_emissions_ctx().with_signer(&[&[
      b"dao",
      ctx.accounts.hnt_mint.key().as_ref(),
      &[ctx.accounts.dao.bump_seed],
    ]]),
    MintArgsV0 {
      amount: rewards_amount,
    },
  )?;

  ctx.accounts.dao_epoch_info.num_rewards_issued += 1;
  ctx.accounts.sub_dao_epoch_info.rewards_issued_at = Some(Clock::get()?.unix_timestamp);
  ctx.accounts.sub_dao_epoch_info.delegation_rewards_issued = delegation_rewards_amount;
  ctx.accounts.dao_epoch_info.done_issuing_rewards =
    ctx.accounts.dao.num_sub_daos == ctx.accounts.dao_epoch_info.num_rewards_issued;

  // update thread to point at next epoch
  let next_epoch = current_epoch(curr_ts);
  let dao_epoch_info = Pubkey::find_program_address(
    &[
      "dao_epoch_info".as_bytes(),
      ctx.accounts.dao.key().as_ref(),
      &next_epoch.to_le_bytes(),
    ],
    &crate::id(),
  )
  .0;

  Ok(ThreadResponse {
    dynamic_instruction: None,
    trigger: Some(Trigger::Account {
      address: dao_epoch_info,
      offset: 8,
      size: 1,
    }),
    close_to: None,
  })
}
