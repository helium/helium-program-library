use std::ops::Div;
use std::str::FromStr;

use crate::errors::ErrorCode;
use crate::{escrow_seeds, ConversionEscrowV0};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use anchor_lang::solana_program::sysvar::instructions::{
  load_current_index_checked, load_instruction_at_checked,
};
use anchor_spl::mint;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};
use data_credits::accounts::MintDataCreditsV0;
use data_credits::{DataCreditsV0, MintDataCreditsArgsV0, TESTING};
use pyth_sdk_solana::load_price_feed_from_account_info;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct LendArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct LendV0<'info> {
  #[account(
    has_one = mint,
    has_one = oracle,
    has_one = escrow,
  )]
  pub conversion_escrow: Box<Account<'info, ConversionEscrowV0>>,
  pub escrow: Account<'info, TokenAccount>,
  /// CHECK: Checked via pyth
  pub oracle: UncheckedAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = hnt_price_oracle,
    // Ensure we're working with the canonical helium data credits
    constraint = data_credits.dc_mint == Pubkey::from_str("dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm").unwrap()
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  /// CHECK: Checked by loading with pyth. Also double checked by the has_one on data credits instance.
  pub hnt_price_oracle: AccountInfo<'info>,

  #[account(
    token::mint = mint
  )]
  pub destination: Box<Account<'info, TokenAccount>>,
  /// CHECK: check instructions account
  #[account(address = sysvar::instructions::ID @ErrorCode::BadInstructionsAccount)]
  pub instructions: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<LendV0>, args: LendArgsV0) -> Result<()> {
  let ixs = ctx.accounts.instructions.to_account_info();

  let price_feed = load_price_feed_from_account_info(&ctx.accounts.oracle).map_err(|e| {
    msg!("Pyth error {}", e);
    error!(ErrorCode::PythError)
  })?;

  let current_time = Clock::get()?.unix_timestamp;
  let price = price_feed
    .get_ema_price_no_older_than(current_time, if TESTING { 6000000 } else { 10 * 60 })
    .ok_or_else(|| error!(ErrorCode::PythPriceNotFound))?;
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let price_with_conf = price
    .price
    .checked_sub(i64::try_from(price.conf.checked_mul(2).unwrap()).unwrap())
    .unwrap();
  // Exponent is a negative number, likely -8
  // Since DC is 5 decimals, this is likely -8, we need to divide by 10^(-expo - 5)
  let exponent_dec = 10_i64
    .checked_pow(u32::try_from(-price.expo - 5).unwrap())
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

  require_gt!(price_with_conf, 0);
  let expected_dc: u64 = price_with_conf
    .checked_div(exponent_dec)
    .unwrap()
    .try_into()
    .unwrap();

  let hnt_price_oracle = load_price_feed_from_account_info(&ctx.accounts.hnt_price_oracle)
    .map_err(|e| {
      msg!("Pyth error {}", e);
      error!(ErrorCode::PythError)
    })?;

  let hnt_price = hnt_price_oracle
    .get_ema_price_no_older_than(current_time, if TESTING { 6000000 } else { 10 * 60 })
    .ok_or_else(|| error!(ErrorCode::PythPriceNotFound))?;

  require_gt!(hnt_price.price, 0);
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let hnt_price_with_conf = hnt_price
    .price
    .checked_sub(i64::try_from(hnt_price.conf.checked_mul(2).unwrap()).unwrap())
    .unwrap();
  // dc_exponent = 5 since $1 = 10^5 DC
  // expo is a negative number, i.e. normally -8 for 8 hnt decimals
  // dc = (price * 10^expo) * (hnt_amount * 10^-hnt_decimals) * 10^dc_exponent
  // dc = price * hnt_amount * 10^(expo - hnt_decimals + dc_exponent)
  // dc = price * hnt_amount / 10^(hnt_decimals - expo - dc_exponent)
  // hnt_amount = dc * 10^(hnt_decimals - expo - dc_exponent) / price
  let exponent = i32::from(8) - hnt_price.expo - 5;
  let decimals_factor = 10_u128
    .checked_pow(u32::try_from(exponent).unwrap())
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

  // make sure this isnt a cpi call
  let current_index = load_current_index_checked(&ixs)? as usize;
  // loop through instructions, looking for an equivalent mint dc to this borrow
  let mut index = current_index + 1; // jupiter swap
  let discriminator = get_function_hash("global", "mint_data_credits_v0");
  loop {
    // get the next instruction, die if theres no more
    if let Ok(ix) = load_instruction_at_checked(index, &ixs) {
      if ix.program_id == data_credits::id() {
        let ix_discriminator: [u8; 8] = ix.data[0..8]
          .try_into()
          .map_err(|_| ErrorCode::UnknownInstruction)?;

        // check if we have a toplevel repay toward the program authority
        if ix_discriminator == discriminator {
          require_keys_eq!(
            ix.accounts[4].pubkey,
            ctx.accounts.conversion_escrow.owner,
            ErrorCode::IncorrectDestination
          );
          require_keys_eq!(
            ix.accounts[0].pubkey,
            ctx.accounts.data_credits.key(),
            ErrorCode::IncorrectDc
          );

          let mint_dc_args: MintDataCreditsArgsV0 =
            MintDataCreditsArgsV0::deserialize(&mut ix.data.as_slice()).unwrap();
          let hnt_amount = mint_dc_args
            .hnt_amount
            .ok_or_else(|| error!(ErrorCode::HntAmountRequired))?;
          let dc_amount_actual = u64::try_from(
            u128::from(hnt_amount)
              .checked_mul(u128::try_from(hnt_price_with_conf).unwrap())
              .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
              .div(decimals_factor),
          )
          .map_err(|_| error!(ErrorCode::ArithmeticError))?;
          let expected_dc_with_slippage = expected_dc
            - (expected_dc * u64::from(ctx.accounts.conversion_escrow.slipage_bps / 10000));
          require_gt!(dc_amount_actual, expected_dc_with_slippage);

          break;
        }
      }
    } else {
      // no more instructions, so we're missing a repay
      return Err(ErrorCode::MissingRepay.into());
    }

    index += 1
  }

  // Send the loan
  mint_to(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.escrow.to_account_info(),
      },
      &[escrow_seeds!(ctx.accounts.conversion_escrow)],
    ),
    args.amount,
  )?;

  Ok(())
}

pub fn get_function_hash(namespace: &str, name: &str) -> [u8; 8] {
  let preimage = format!("{}:{}", namespace, name);
  let mut sighash = [0u8; 8];
  sighash
    .copy_from_slice(&anchor_lang::solana_program::hash::hash(preimage.as_bytes()).to_bytes()[..8]);
  sighash
}
