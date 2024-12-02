use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};

use crate::{dao_seeds, DaoV0};

#[derive(Accounts)]
pub struct SwitchMobileOpsFund<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = mobile_mint,
    associated_token::authority = payer
  )]
  pub ops_fund_mobile: Account<'info, TokenAccount>,
  #[account(
    mut,
    address = Pubkey::from_str("mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6").unwrap()
  )]
  pub mobile_mint: Account<'info, Mint>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = payer
  )]
  pub ops_fund_hnt: Account<'info, TokenAccount>,
  #[account(
    has_one = hnt_mint,
    has_one = authority
  )]
  pub dao: Account<'info, DaoV0>,
  #[account(mut)]
  pub hnt_mint: Account<'info, Mint>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = hnt_circuit_breaker.bump_seed
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

#[allow(clippy::inconsistent_digit_grouping)]
pub fn handler(ctx: Context<SwitchMobileOpsFund>) -> Result<()> {
  burn(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Burn {
        mint: ctx.accounts.mobile_mint.to_account_info(),
        from: ctx.accounts.ops_fund_mobile.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
      },
    ),
    18_197_425_725_000000,
  )?;
  mint_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      MintV0 {
        mint: ctx.accounts.hnt_mint.to_account_info(),
        to: ctx.accounts.ops_fund_hnt.to_account_info(),
        circuit_breaker: ctx.accounts.hnt_circuit_breaker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        mint_authority: ctx.accounts.dao.to_account_info(),
      },
      &[dao_seeds!(ctx.accounts.dao)],
    ),
    MintArgsV0 {
      amount: 1_300_000_00000000,
    },
  )?;
  Ok(())
}
