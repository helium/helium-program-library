use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, AccountWindowedCircuitBreakerV0, WindowedCircuitBreakerConfigV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateAccountWindowedBreakerArgsV0 {
  pub new_authority: Option<Pubkey>,
  pub config: Option<WindowedCircuitBreakerConfigV0>,
}

#[derive(Accounts)]
pub struct UpdateAccountWindowedBreakerV0<'info> {
  #[account(
    mut,
    has_one = authority,
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  pub authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<UpdateAccountWindowedBreakerV0>,
  args: UpdateAccountWindowedBreakerArgsV0,
) -> Result<()> {
  let circuit_breaker = &mut ctx.accounts.circuit_breaker;
  if let Some(new_authority) = args.new_authority {
    circuit_breaker.authority = new_authority;
  }
  if let Some(config) = args.config {
    require!(config.is_valid(), ErrorCode::InvalidConfig);
    circuit_breaker.config = config;
  }

  Ok(())
}
