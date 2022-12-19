use anchor_lang::prelude::*;

use crate::{AccountWindowedCircuitBreakerV0, WindowedCircuitBreakerConfigV0};

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
  if args.new_authority.is_some() {
    circuit_breaker.authority = args.new_authority.unwrap();
  }
  if args.config.is_some() {
    circuit_breaker.config = args.config.unwrap();
  }

  Ok(())
}
