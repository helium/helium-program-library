use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use circuit_breaker::{
  cpi::{accounts::UpdateMintWindowedBreakerV0, update_mint_windowed_breaker_v0},
  CircuitBreaker, MintWindowedCircuitBreakerV0, UpdateMintWindowedBreakerArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateDaoArgsV0 {
  pub authority: Option<Pubkey>,
  pub emission_schedule: Option<Vec<EmissionScheduleItem>>,
  pub hst_emission_schedule: Option<Vec<PercentItem>>,
}

#[derive(Accounts)]
#[instruction(args: UpdateDaoArgsV0)]
pub struct UpdateDaoV0<'info> {
  #[account(
    mut,
    seeds = ["dao".as_bytes(), dao.hnt_mint.key().as_ref()],
    bump = dao.bump_seed,
    has_one = authority,
    has_one = hnt_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,

  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<UpdateDaoV0>, args: UpdateDaoArgsV0) -> Result<()> {
  if let Some(new_authority) = args.authority {
    ctx.accounts.dao.authority = new_authority;
    // update the circuit breaker authority
    update_mint_windowed_breaker_v0(
      CpiContext::new(
        ctx.accounts.circuit_breaker_program.to_account_info(),
        UpdateMintWindowedBreakerV0 {
          authority: ctx.accounts.authority.to_account_info(),
          circuit_breaker: ctx.accounts.hnt_circuit_breaker.to_account_info(),
        },
      ),
      UpdateMintWindowedBreakerArgsV0 {
        new_authority: Some(new_authority),
        config: None,
      },
    )?;
  }

  if let Some(emission_schedule) = args.emission_schedule {
    ctx.accounts.dao.emission_schedule = emission_schedule;
  }

  if let Some(hst_emission_schedule) = args.hst_emission_schedule {
    ctx.accounts.dao.hst_emission_schedule = hst_emission_schedule;
  }

  Ok(())
}
