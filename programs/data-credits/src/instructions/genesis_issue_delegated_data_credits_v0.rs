use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::token::{Mint, Token, TokenAccount};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GenesisIssueDelegatedDataCreditsArgsV0 {
  amount: u64,
  router_key: String,
}

#[derive(Accounts)]
#[instruction(args: GenesisIssueDelegatedDataCreditsArgsV0)]
pub struct GenesisIssueDelegatedDataCreditsV0<'info> {
  #[account(
    init,
    payer = lazy_signer,
    space = 60 + std::mem::size_of::<DataCreditsV0>(),
    seeds = [
      "delegated_data_credits".as_bytes(),
      sub_dao.key().as_ref(),
      &hash(args.router_key.as_bytes()).to_bytes()
    ],
    bump,
  )]
  pub delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,
  #[account(
    has_one = dc_mint,
    seeds = ["dc".as_bytes(), dc_mint.key().as_ref()],
    bump = data_credits.data_credits_bump
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(
    mut,
    seeds = [b"lazy_signer", b"testhelium12"],
    seeds::program = lazy_transactions::ID,
    bump,
  )]
  pub lazy_signer: Signer<'info>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dc_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  #[account(
    has_one = dc_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    init_if_needed,
    payer = lazy_signer,
    seeds = ["escrow_dc_account".as_bytes(), delegated_data_credits.key().as_ref()],
    bump,
    token::mint = dc_mint,
    token::authority = delegated_data_credits
  )]
  pub escrow_account: Account<'info, TokenAccount>,

  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<GenesisIssueDelegatedDataCreditsV0>,
  args: GenesisIssueDelegatedDataCreditsArgsV0,
) -> Result<()> {
  ctx
    .accounts
    .delegated_data_credits
    .set_inner(DelegatedDataCreditsV0 {
      data_credits: ctx.accounts.data_credits.key(),
      router_key: args.router_key,
      sub_dao: ctx.accounts.sub_dao.key(),
      escrow_account: ctx.accounts.escrow_account.key(),
      bump: ctx.bumps["delegated_data_credits"],
    });

  let signer_seeds: &[&[&[u8]]] = &[&[
    "dc".as_bytes(),
    ctx.accounts.dc_mint.to_account_info().key.as_ref(),
    &[ctx.accounts.data_credits.data_credits_bump],
  ]];

  let cpi_accounts = MintV0 {
    mint: ctx.accounts.dc_mint.to_account_info(),
    to: ctx.accounts.escrow_account.to_account_info(),
    mint_authority: ctx.accounts.data_credits.to_account_info(),
    token_program: ctx.accounts.token_program.to_account_info(),
    circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
  };

  // mint the new tokens to recipient
  mint_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      cpi_accounts,
      signer_seeds,
    ),
    MintArgsV0 {
      amount: args.amount,
    },
  )?;

  Ok(())
}
