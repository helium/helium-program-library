use crate::circuit_breaker::*;
use crate::errors::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, SetAuthority};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::{
  cpi::{accounts::InitializeMintWindowedBreakerV0, initialize_mint_windowed_breaker_v0},
  CircuitBreaker, InitializeMintWindowedBreakerArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDataCreditsArgsV0 {
  authority: Pubkey,
  config: WindowedCircuitBreakerConfigV0,
}

#[derive(Accounts)]
#[instruction(args: InitializeDataCreditsArgsV0)]
pub struct InitializeDataCreditsV0<'info> {
  #[account(
    init, // prevents from reinit attack
    payer = payer,
    space = 60 + std::mem::size_of::<DataCreditsV0>(),
    seeds = ["dc".as_bytes(), dc_mint.key().as_ref()],
    bump,
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  pub hnt_mint: Box<Account<'info, Mint>>,
  /// CHECK: Initialized via cpi
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dc_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump
  )]
  pub circuit_breaker: AccountInfo<'info>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,

  pub mint_authority: Signer<'info>,
  pub freeze_authority: Signer<'info>,

  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["account_payer".as_bytes()],
    bump,
  )]
  pub account_payer: AccountInfo<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeDataCreditsV0>,
  args: InitializeDataCreditsArgsV0,
) -> Result<()> {
  ctx.accounts.data_credits.dc_mint = ctx.accounts.dc_mint.key();
  ctx.accounts.data_credits.hnt_mint = ctx.accounts.hnt_mint.key();
  ctx.accounts.data_credits.authority = args.authority;

  ctx.accounts.data_credits.data_credits_bump = *ctx
    .bumps
    .get("data_credits")
    .ok_or(DataCreditsErrors::BumpNotAvailable)?;

  ctx.accounts.data_credits.account_payer = ctx.accounts.account_payer.key();
  ctx.accounts.data_credits.account_payer_bump = *ctx
    .bumps
    .get("account_payer")
    .ok_or(DataCreditsErrors::BumpNotAvailable)?;

  msg!("Claiming mint and freeze authority");
  initialize_mint_windowed_breaker_v0(
    CpiContext::new(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      InitializeMintWindowedBreakerV0 {
        payer: ctx.accounts.payer.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        mint: ctx.accounts.dc_mint.to_account_info(),
        mint_authority: ctx.accounts.mint_authority.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
      },
    ),
    InitializeMintWindowedBreakerArgsV0 {
      authority: args.authority,
      config: args.config.into(),
      mint_authority: ctx.accounts.data_credits.key(),
    },
  )?;
  let dc_authority = Some(*ctx.accounts.data_credits.to_account_info().key);
  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.dc_mint.to_account_info(),
        current_authority: ctx.accounts.freeze_authority.to_account_info(),
      },
    ),
    AuthorityType::FreezeAccount,
    dc_authority,
  )?;
  Ok(())
}
