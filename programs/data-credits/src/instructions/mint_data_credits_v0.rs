use std::ops::Div;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Burn, FreezeAccount, Mint, ThawAccount, Token, TokenAccount},
};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};

use crate::{errors::*, DataCreditsV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MintDataCreditsArgsV0 {
  pub hnt_amount: Option<u64>,
  pub dc_amount: Option<u64>,
}

pub const TESTING: bool = std::option_env!("TESTING").is_some();

pub const HNT_PRICE_FEED_ID: [u8; 32] = [
  0x64, 0x9f, 0xdd, 0x7e, 0xc0, 0x8e, 0x8e, 0x2a, 0x20, 0xf4, 0x25, 0x72, 0x98, 0x54, 0xe9, 0x02,
  0x93, 0xdc, 0xbe, 0x23, 0x76, 0xab, 0xc4, 0x71, 0x97, 0xa1, 0x4d, 0xa6, 0xff, 0x33, 0x97, 0x56,
];

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
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  /// CHECK: Checked by loading with pyth. Also double checked by the has_one on data credits instance.
  #[account(
    constraint = hnt_price_oracle.verification_level == VerificationLevel::Full @ DataCreditsErrors::PythPriceFeedStale,
    constraint = hnt_price_oracle.price_message.feed_id == HNT_PRICE_FEED_ID,
  )]
  pub hnt_price_oracle: Account<'info, PriceUpdateV2>,

  // hnt tokens from this account are burned
  #[account(
    mut,
    token::mint = hnt_mint,
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

  // unfreeze the recipient_token_account if necessary
  if ctx.accounts.recipient_token_account.is_frozen() {
    token::thaw_account(ctx.accounts.thaw_ctx().with_signer(signer_seeds))?;
  }

  let hnt_price_oracle = &ctx.accounts.hnt_price_oracle;
  let message = hnt_price_oracle.price_message;

  let current_time = Clock::get()?.unix_timestamp;
  require_gte!(
    message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    DataCreditsErrors::PythPriceNotFound
  );
  let hnt_price = message.ema_price;
  require_gt!(hnt_price, 0);

  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let hnt_price_with_conf = hnt_price
    .checked_sub(i64::try_from(message.ema_conf.checked_mul(2).unwrap()).unwrap())
    .unwrap();

  // dc_exponent = 5 since $1 = 10^5 DC
  // expo is a negative number, i.e. normally -8 for 8 hnt decimals
  // dc = (price * 10^expo) * (hnt_amount * 10^-hnt_decimals) * 10^dc_exponent
  // dc = price * hnt_amount * 10^(expo - hnt_decimals + dc_exponent)
  // dc = price * hnt_amount / 10^(hnt_decimals - expo - dc_exponent)
  // hnt_amount = dc * 10^(hnt_decimals - expo - dc_exponent) / price
  let exponent = i32::from(ctx.accounts.hnt_mint.decimals) - message.exponent - 5;
  let decimals_factor = 10_u128
    .checked_pow(u32::try_from(exponent).unwrap())
    .ok_or_else(|| error!(DataCreditsErrors::ArithmeticError))?;

  let (hnt_amount, dc_amount) = match (args.hnt_amount, args.dc_amount) {
    (Some(hnt_amount), None) => {
      let dc_amount = u64::try_from(
        u128::from(hnt_amount)
          .checked_mul(u128::try_from(hnt_price_with_conf).unwrap())
          .ok_or_else(|| error!(DataCreditsErrors::ArithmeticError))?
          .div(decimals_factor),
      )
      .map_err(|_| error!(DataCreditsErrors::ArithmeticError))?;

      (hnt_amount, dc_amount)
    }
    (None, Some(dc_amount)) => {
      let hnt_amount = u64::try_from(
        u128::from(dc_amount)
          .checked_mul(decimals_factor)
          .ok_or_else(|| error!(DataCreditsErrors::ArithmeticError))?
          .checked_div(u128::try_from(hnt_price_with_conf).unwrap())
          .ok_or_else(|| error!(DataCreditsErrors::ArithmeticError))?,
      )
      .map_err(|_| error!(DataCreditsErrors::ArithmeticError))?;

      (hnt_amount, dc_amount)
    }
    (None, None) => {
      return Err(error!(DataCreditsErrors::InvalidArgs));
    }
    (Some(_), Some(_)) => {
      return Err(error!(DataCreditsErrors::InvalidArgs));
    }
  };

  // burn the hnt tokens
  token::burn(ctx.accounts.burn_ctx(), hnt_amount)?;

  msg!(
    "HNT Price is {} * 10^{}, issuing {} data credits",
    hnt_price_with_conf,
    message.exponent,
    dc_amount
  );

  // mint the new tokens to recipient
  mint_v0(
    ctx.accounts.mint_ctx().with_signer(signer_seeds),
    MintArgsV0 { amount: dc_amount },
  )?;

  token::freeze_account(ctx.accounts.freeze_ctx().with_signer(signer_seeds))?;

  Ok(())
}
