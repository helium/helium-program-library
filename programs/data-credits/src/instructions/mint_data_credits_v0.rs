use std::ops::Div;

use crate::errors::*;
use crate::DataCreditsV0;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Burn, FreezeAccount, Mint, ThawAccount, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};
use pyth_sdk_solana::load_price_feed_from_account_info;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MintDataCreditsArgsV0 {
  hnt_amount: u64,
}

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(Accounts)]
#[instruction(args: MintDataCreditsArgsV0)]
pub struct MintDataCreditsV0<'info> {
  #[account(
    seeds = [
      "dc".as_bytes(),
      dc_mint.key().as_ref(),
    ],
    bump = data_credits.data_credits_bump,
    has_one = hnt_mint,
    has_one = dc_mint,
    has_one = hnt_price_oracle
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  /// CHECK: Checked via load call in handler
  pub hnt_price_oracle: AccountInfo<'info>,

  // hnt tokens from this account are burned
  #[account(
    mut,
    constraint = burner.mint == hnt_mint.key(),
    constraint = burner.amount >= args.hnt_amount,
    has_one = owner,
  )]
  pub burner: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = owner,
    associated_token::mint = dc_mint,
    associated_token::authority = recipient,
  )]
  pub recipient_token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: DC credits sent here
  pub recipient: AccountInfo<'info>,

  #[account(mut)]
  pub owner: Signer<'info>,

  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
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
  pub token_program: Program<'info, Token>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> MintDataCreditsV0<'info> {
  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.hnt_mint.to_account_info(),
      from: self.burner.to_account_info(),
      authority: self.owner.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn thaw_ctx(&self) -> CpiContext<'_, '_, '_, 'info, ThawAccount<'info>> {
    let cpi_accounts = ThawAccount {
      account: self.recipient_token_account.to_account_info(),
      mint: self.dc_mint.to_account_info(),
      authority: self.data_credits.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    let cpi_accounts = MintV0 {
      mint: self.dc_mint.to_account_info(),
      to: self.recipient_token_account.to_account_info(),
      mint_authority: self.data_credits.to_account_info(),
      token_program: self.token_program.to_account_info(),
      circuit_breaker: self.circuit_breaker.to_account_info(),
      clock: self.clock.to_account_info(),
    };
    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }

  fn freeze_ctx(&self) -> CpiContext<'_, '_, '_, 'info, FreezeAccount<'info>> {
    let cpi_accounts = FreezeAccount {
      account: self.recipient_token_account.to_account_info(),
      mint: self.dc_mint.to_account_info(),
      authority: self.data_credits.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<MintDataCreditsV0>, args: MintDataCreditsArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    b"dc",
    ctx.accounts.dc_mint.to_account_info().key.as_ref(),
    &[ctx.accounts.data_credits.data_credits_bump],
  ]];

  // burn the hnt tokens
  token::burn(ctx.accounts.burn_ctx(), args.hnt_amount)?;

  // unfreeze the recipient_token_account if necessary
  if ctx.accounts.recipient_token_account.is_frozen() {
    token::thaw_account(ctx.accounts.thaw_ctx().with_signer(signer_seeds))?;
  }

  let hnt_price_oracle = load_price_feed_from_account_info(&ctx.accounts.hnt_price_oracle)
    .map_err(|e| {
      msg!("Pyth error {}", e);
      error!(DataCreditsErrors::PythError)
    })?;

  let current_time = Clock::get()?.unix_timestamp;
  let hnt_price = hnt_price_oracle
    .get_ema_price_no_older_than(current_time, if TESTING { 6000000 } else { 60 })
    .ok_or_else(|| error!(DataCreditsErrors::PythPriceNotFound))?;

  // price * hnt_amount / 10^(8 + expo - 5)
  let price_expo = -hnt_price.expo;
  let right_shift = 8 + price_expo - 5;
  let normalize = 10_u64
    .checked_pow(u32::try_from(right_shift).unwrap())
    .ok_or_else(|| error!(DataCreditsErrors::ArithmeticError))?;

  let dc_amount = u64::try_from(
    u128::from(args.hnt_amount)
      .checked_mul(u128::try_from(hnt_price.price).unwrap())
      .ok_or_else(|| error!(DataCreditsErrors::ArithmeticError))?
      .div(u128::from(normalize)),
  )
  .map_err(|_| error!(DataCreditsErrors::ArithmeticError))?;

  msg!(
    "HNT Price is {} * 10^{}, issuing {} data credits",
    hnt_price.price,
    hnt_price.expo,
    dc_amount
  );

  // mint the new tokens to recipient
  // TODO needs to mint at an oracle provided rate to hnt
  mint_v0(
    ctx.accounts.mint_ctx().with_signer(signer_seeds),
    MintArgsV0 { amount: dc_amount },
  )?;

  token::freeze_account(ctx.accounts.freeze_ctx().with_signer(signer_seeds))?;

  Ok(())
}
