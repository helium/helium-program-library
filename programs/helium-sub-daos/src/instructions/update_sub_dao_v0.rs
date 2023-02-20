use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use circuit_breaker::{
  cpi::{
    accounts::{UpdateAccountWindowedBreakerV0, UpdateMintWindowedBreakerV0},
    update_account_windowed_breaker_v0, update_mint_windowed_breaker_v0,
  },
  AccountWindowedCircuitBreakerV0, CircuitBreaker, MintWindowedCircuitBreakerV0,
  UpdateAccountWindowedBreakerArgsV0, UpdateMintWindowedBreakerArgsV0,
};
use treasury_management::TreasuryManagementV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateSubDaoArgsV0 {
  pub authority: Option<Pubkey>,
  pub emission_schedule: Option<Vec<EmissionScheduleItem>>,
  pub onboarding_dc_fee: Option<u64>,
  pub dc_burn_authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateSubDaoArgsV0)]
pub struct UpdateSubDaoV0<'info> {
  #[account(
    mut,
    seeds = ["sub_dao".as_bytes(), sub_dao.dnt_mint.key().as_ref()],
    bump = sub_dao.bump_seed,
    has_one = authority,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,

  pub dnt_mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub dnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  #[account(mut)]
  pub treasury: Box<Account<'info, TreasuryManagementV0>>,
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), treasury.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump,
  )]
  pub treasury_circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<UpdateSubDaoV0>, args: UpdateSubDaoArgsV0) -> Result<()> {
  if let Some(new_authority) = args.authority {
    ctx.accounts.sub_dao.authority = new_authority;
    // update the dnt circuit breaker authority
    update_mint_windowed_breaker_v0(
      CpiContext::new(
        ctx.accounts.circuit_breaker_program.to_account_info(),
        UpdateMintWindowedBreakerV0 {
          authority: ctx.accounts.authority.to_account_info(),
          circuit_breaker: ctx.accounts.dnt_circuit_breaker.to_account_info(),
        },
      ),
      UpdateMintWindowedBreakerArgsV0 {
        new_authority: Some(new_authority),
        config: None,
      },
    )?;

    // update the treasury circuit breaker authority
    update_account_windowed_breaker_v0(
      CpiContext::new(
        ctx.accounts.circuit_breaker_program.to_account_info(),
        UpdateAccountWindowedBreakerV0 {
          authority: ctx.accounts.authority.to_account_info(),
          circuit_breaker: ctx.accounts.treasury_circuit_breaker.to_account_info(),
        },
      ),
      UpdateAccountWindowedBreakerArgsV0 {
        new_authority: Some(new_authority),
        config: None,
      },
    )?;
  }

  if let Some(emission_schedule) = args.emission_schedule {
    ctx.accounts.sub_dao.emission_schedule = emission_schedule;
  }

  if let Some(onboarding_dc_fee) = args.onboarding_dc_fee {
    ctx.accounts.sub_dao.onboarding_dc_fee = onboarding_dc_fee;
  }

  if let Some(dc_burn_authority) = args.dc_burn_authority {
    ctx.accounts.sub_dao.dc_burn_authority = dc_burn_authority;
  }
  Ok(())
}
