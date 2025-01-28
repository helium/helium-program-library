use anchor_lang::prelude::*;
use anchor_spl::{
  self,
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::InitializeAccountWindowedBreakerV0, initialize_account_windowed_breaker_v0},
  CircuitBreaker, InitializeAccountWindowedBreakerArgsV0, ThresholdType as CBThresholdType,
  WindowedCircuitBreakerConfigV0 as CBWindowedCircuitBreakerConfigV0,
};

use crate::{dao_seeds, state::*, EPOCH_LENGTH};

#[derive(Accounts)]
pub struct InitializeHntDelegatorPool<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  /// CHECK: Initialized via cpi
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), delegator_pool.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub delegator_pool_circuit_breaker: AccountInfo<'info>,
  #[account(
    init,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = dao,
  )]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> InitializeHntDelegatorPool<'info> {
  fn initialize_delegator_pool_breaker_ctx(
    &self,
  ) -> CpiContext<'_, '_, '_, 'info, InitializeAccountWindowedBreakerV0<'info>> {
    let cpi_accounts = InitializeAccountWindowedBreakerV0 {
      payer: self.payer.to_account_info(),
      circuit_breaker: self.delegator_pool_circuit_breaker.to_account_info(),
      token_account: self.delegator_pool.to_account_info(),
      owner: self.dao.to_account_info(),
      token_program: self.token_program.to_account_info(),
      system_program: self.system_program.to_account_info(),
    };
    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<InitializeHntDelegatorPool>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[dao_seeds!(ctx.accounts.dao)];

  initialize_account_windowed_breaker_v0(
    ctx
      .accounts
      .initialize_delegator_pool_breaker_ctx()
      .with_signer(signer_seeds),
    InitializeAccountWindowedBreakerArgsV0 {
      authority: ctx.accounts.dao.authority,
      config: CBWindowedCircuitBreakerConfigV0 {
        window_size_seconds: u64::try_from(EPOCH_LENGTH).unwrap(),
        threshold_type: CBThresholdType::Absolute,
        // Roughly 25% of the daily emissions
        threshold: ctx.accounts.dao.emission_schedule[0].emissions_per_epoch / 25,
      },
      owner: ctx.accounts.dao.key(),
    },
  )?;
  ctx.accounts.dao.delegator_pool = ctx.accounts.delegator_pool.key();

  Ok(())
}
