use anchor_lang::prelude::*;
use anchor_spl::token::{
  set_authority, spl_token::instruction::AuthorityType, SetAuthority, Token, TokenAccount,
};

use crate::{AccountWindowedCircuitBreakerV0, WindowV0, WindowedCircuitBreakerConfigV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeAccountWindowedBreakerArgsV0 {
  pub authority: Pubkey,
  pub owner: Pubkey,
  pub config: WindowedCircuitBreakerConfigV0,
}

#[derive(Accounts)]
pub struct InitializeAccountWindowedBreakerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + std::mem::size_of::<AccountWindowedCircuitBreakerV0>(),
    seeds = ["account_windowed_breaker".as_bytes(), token_account.key().as_ref()],
    bump
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  #[account(
    mut,
    has_one = owner
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  pub owner: Signer<'info>,

  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeAccountWindowedBreakerV0>,
  args: InitializeAccountWindowedBreakerArgsV0,
) -> Result<()> {
  ctx
    .accounts
    .circuit_breaker
    .set_inner(AccountWindowedCircuitBreakerV0 {
      token_account: ctx.accounts.token_account.key(),
      authority: args.authority,
      owner: args.owner,
      config: args.config,
      last_window: WindowV0 {
        last_aggregated_value: 0,
        last_unix_timestamp: 0,
      },
      bump_seed: ctx.bumps["circuit_breaker"],
    });

  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.token_account.to_account_info(),
        current_authority: ctx.accounts.owner.to_account_info(),
      },
    ),
    AuthorityType::AccountOwner,
    Some(ctx.accounts.circuit_breaker.key()),
  )?;

  Ok(())
}
