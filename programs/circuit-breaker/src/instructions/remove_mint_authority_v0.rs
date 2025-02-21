use anchor_lang::prelude::*;
use anchor_spl::token::{
  set_authority, spl_token::instruction::AuthorityType, Mint, SetAuthority, Token,
};

use crate::{mint_windowed_circuit_breaker_seeds, MintWindowedCircuitBreakerV0};

#[derive(Accounts)]
pub struct RemoveMintAuthorityV0<'info> {
  #[account(mut)]
  /// CHECK: Just receives rent refund
  pub rent_refund: UncheckedAccount<'info>,
  #[account(mut)]
  pub mint: Box<Account<'info, Mint>>,
  pub authority: Signer<'info>,
  #[account(
    mut,
    close = rent_refund,
    has_one = authority,
    has_one = mint,
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RemoveMintAuthorityV0>) -> Result<()> {
  set_authority(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.mint.to_account_info(),
        current_authority: ctx.accounts.circuit_breaker.to_account_info(),
      },
      &[mint_windowed_circuit_breaker_seeds!(
        ctx.accounts.circuit_breaker
      )],
    ),
    AuthorityType::MintTokens,
    None,
  )?;
  Ok(())
}
