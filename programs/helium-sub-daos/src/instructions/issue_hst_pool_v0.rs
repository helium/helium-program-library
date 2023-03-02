use crate::{current_epoch, error::ErrorCode, state::*, TESTING};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};
use clockwork_sdk::state::{ThreadResponse, Trigger};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueHstPoolArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: IssueHstPoolArgsV0)]
pub struct IssueHstPoolV0<'info> {
  #[account(
    mut,
    has_one = hnt_mint,
    has_one = hst_pool
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
    constraint = dao_epoch_info.num_utility_scores_calculated >= dao.num_sub_daos @ ErrorCode::MissingUtilityScores,
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = dao_epoch_info.bump_seed,
    constraint = !dao_epoch_info.done_issuing_hst_pool
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = hnt_circuit_breaker.bump_seed
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub hst_pool: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

impl<'info> IssueHstPoolV0<'info> {
  pub fn mint_hst_emissions_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    let cpi_accounts = MintV0 {
      mint: self.hnt_mint.to_account_info(),
      to: self.hst_pool.to_account_info(),
      mint_authority: self.dao.to_account_info(),
      circuit_breaker: self.hnt_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<IssueHstPoolV0>, args: IssueHstPoolArgsV0) -> Result<ThreadResponse> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts);

  if !TESTING && args.epoch >= epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  let total_emissions = ctx.accounts.dao_epoch_info.total_rewards;
  let percent = ctx
    .accounts
    .dao
    .hst_emission_schedule
    .get_percent_at(curr_ts)
    .unwrap();
  // Subdaos get the remainder after hst
  let emissions = u64::from(percent)
    .checked_mul(total_emissions)
    .unwrap()
    .checked_div(100)
    .unwrap();

  mint_v0(
    ctx.accounts.mint_hst_emissions_ctx().with_signer(&[&[
      b"dao",
      ctx.accounts.hnt_mint.key().as_ref(),
      &[ctx.accounts.dao.bump_seed],
    ]]),
    MintArgsV0 { amount: emissions },
  )?;

  ctx.accounts.dao_epoch_info.done_issuing_hst_pool = true;

  // update thread to point at next epoch
  let next_epoch = current_epoch(curr_ts);

  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &next_epoch.to_le_bytes(),
  ];
  let next_dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  Ok(ThreadResponse {
    dynamic_instruction: None,
    trigger: Some(Trigger::Account {
      address: next_dao_epoch_info,
      offset: 8,
      size: 1,
    }),
    close_to: None,
  })
}
