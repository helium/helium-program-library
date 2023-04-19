use std::str::FromStr;

use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;
use circuit_breaker::{
  cpi::{accounts::TransferV0, transfer_v0},
  AccountWindowedCircuitBreakerV0, CircuitBreaker, TransferArgsV0,
};

#[derive(Accounts)]
pub struct CorrectTreasuriesV0<'info> {
  #[account(
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub admin: Signer<'info>,
  #[account(
    has_one = treasury,
  )]
  pub treasury_management: Box<Account<'info, TreasuryManagementV0>>,
  #[account(
    mut,
    // Mobile treasury
    address = Pubkey::from_str("BUCbfE1pbjUYrdw39kFWHqE3GuvwNVpN4gpWkmugQCpR").unwrap()
  )]
  pub treasury: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    // Iot treasury
    address = Pubkey::from_str("CpyoYpaEZc8DvmkNWNZWfkQDFvGAvHp5mhtEhwGQhkTk").unwrap()
  )]
  pub dest_treasury: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), treasury.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = circuit_breaker.bump_seed,
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CorrectTreasuriesV0>) -> Result<()> {
  transfer_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      TransferV0 {
        from: ctx.accounts.treasury.to_account_info(),
        to: ctx.accounts.dest_treasury.to_account_info(),
        owner: ctx.accounts.treasury_management.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
      &[&[
        b"treasury_management",
        ctx.accounts.treasury_management.supply_mint.as_ref(),
        &[ctx.accounts.treasury_management.bump_seed],
      ]],
    ),
    TransferArgsV0 {
      amount: 27103509411,
    },
  )?;
  Ok(())
}
