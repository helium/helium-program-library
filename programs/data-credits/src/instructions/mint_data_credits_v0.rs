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
use pyth_solana_receiver_sdk::{
  price_update::{PriceUpdateV2, VerificationLevel},
  LEGACY_PYTH_SOLANA_RECEIVER_ID,
};

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

  /// CHECK: Manually verified in the handler via `load_hnt_price_oracle` — the account
  /// must be owned by the legacy or pro Pyth receiver, deserialize as a PriceUpdateV2
  /// for the HNT feed with Full verification, and be within the freshness window.
  pub hnt_price_oracle: UncheckedAccount<'info>,

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

/// Loads the HNT price oracle from a caller-supplied account, accepting either the
/// legacy or the pro Pyth receiver as owner so old-SDK and new-SDK callers can both
/// mint. Checks owner, discriminator, feed id, and Full verification; staleness is
/// checked separately in the handler.
pub fn load_hnt_price_oracle(account_info: &AccountInfo) -> Result<PriceUpdateV2> {
  require!(
    account_info.owner == &pyth_solana_receiver_sdk::ID
      || account_info.owner == &LEGACY_PYTH_SOLANA_RECEIVER_ID,
    DataCreditsErrors::InvalidPriceOracleOwner
  );
  let data = account_info.try_borrow_data()?;
  let price_update = PriceUpdateV2::try_deserialize(&mut data.as_ref())?;
  require!(
    price_update.verification_level == VerificationLevel::Full,
    DataCreditsErrors::PythPriceFeedStale
  );
  require!(
    price_update.price_message.feed_id == HNT_PRICE_FEED_ID,
    DataCreditsErrors::PythError
  );
  Ok(price_update)
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

  let hnt_price_oracle = load_hnt_price_oracle(&ctx.accounts.hnt_price_oracle)?;
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

#[cfg(test)]
mod tests {
  use anchor_lang::AccountSerialize;
  use pythnet_sdk::messages::PriceFeedMessage;

  use super::*;

  fn price_update_data(feed_id: [u8; 32], verification_level: VerificationLevel) -> Vec<u8> {
    let price_update = PriceUpdateV2 {
      write_authority: Pubkey::new_unique(),
      verification_level,
      price_message: PriceFeedMessage {
        feed_id,
        price: 1,
        conf: 2,
        exponent: -8,
        publish_time: 900,
        prev_publish_time: 899,
        ema_price: 1,
        ema_conf: 2,
      },
      posted_slot: 0,
    };
    let mut data = Vec::new();
    price_update.try_serialize(&mut data).unwrap();
    data
  }

  fn load(owner: &Pubkey, data: &mut [u8]) -> Result<PriceUpdateV2> {
    let key = Pubkey::new_unique();
    let mut lamports = 0;
    let account_info = AccountInfo::new(&key, false, false, &mut lamports, data, owner, false, 0);
    load_hnt_price_oracle(&account_info)
  }

  #[test]
  fn accepts_pro_receiver_owner() {
    let mut data = price_update_data(HNT_PRICE_FEED_ID, VerificationLevel::Full);
    assert!(load(&pyth_solana_receiver_sdk::ID, &mut data).is_ok());
  }

  #[test]
  fn accepts_legacy_receiver_owner() {
    let mut data = price_update_data(HNT_PRICE_FEED_ID, VerificationLevel::Full);
    assert!(load(&LEGACY_PYTH_SOLANA_RECEIVER_ID, &mut data).is_ok());
  }

  #[test]
  fn rejects_other_owner() {
    let mut data = price_update_data(HNT_PRICE_FEED_ID, VerificationLevel::Full);
    assert_eq!(
      load(&Pubkey::new_unique(), &mut data).map(|_| ()),
      Err(error!(DataCreditsErrors::InvalidPriceOracleOwner))
    );
  }

  #[test]
  fn rejects_mismatched_feed_id() {
    let mut data = price_update_data([1; 32], VerificationLevel::Full);
    assert_eq!(
      load(&pyth_solana_receiver_sdk::ID, &mut data).map(|_| ()),
      Err(error!(DataCreditsErrors::PythError))
    );
  }

  #[test]
  fn rejects_partial_verification() {
    let mut data = price_update_data(
      HNT_PRICE_FEED_ID,
      VerificationLevel::Partial { num_signatures: 5 },
    );
    assert_eq!(
      load(&pyth_solana_receiver_sdk::ID, &mut data).map(|_| ()),
      Err(error!(DataCreditsErrors::PythPriceFeedStale))
    );
  }

  #[test]
  fn rejects_non_price_update_data() {
    let mut data = vec![0u8; 134];
    assert!(load(&pyth_solana_receiver_sdk::ID, &mut data).is_err());
  }
}
