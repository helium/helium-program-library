use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{MintWindowedCircuitBreakerV0, WindowedCircuitBreakerConfigV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateMintWindowedBreakerArgsV0 {
  pub new_authority: Option<Pubkey>,
  pub config: Option<WindowedCircuitBreakerConfigV0>,
}

#[derive(Accounts)]
pub struct UpdateMintWindowedBreakerV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), mint.key().as_ref()],
    bump,
    has_one = authority,
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub mint: Box<Account<'info, Mint>>,
}

pub fn handler(
  ctx: Context<UpdateMintWindowedBreakerV0>,
  args: UpdateMintWindowedBreakerArgsV0,
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
