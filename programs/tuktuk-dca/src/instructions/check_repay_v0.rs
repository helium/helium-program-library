use std::cmp::Ordering;

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use tuktuk_program::{types::TransactionSourceV0, RunTaskReturnV0, TaskReturnV0, TriggerV0};

use crate::{errors::ErrorCode, state::*, TESTING};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CheckRepayArgsV0 {}

#[derive(Accounts)]
#[instruction(args: CheckRepayArgsV0)]
pub struct CheckRepayV0<'info> {
  #[account(
    mut,
    has_one = input_mint,
    has_one = output_mint,
    has_one = destination_wallet,
    has_one = input_price_oracle,
    has_one = output_price_oracle,
    constraint = dca.is_swapping @ ErrorCode::LendNotCalled,
  )]
  pub dca: Box<Account<'info, DcaV0>>,
  pub input_mint: Box<Account<'info, Mint>>,
  pub output_mint: Box<Account<'info, Mint>>,
  /// CHECK: destination wallet for output tokens
  pub destination_wallet: UncheckedAccount<'info>,
  #[account(
    mut,
    associated_token::mint = output_mint,
    associated_token::authority = destination_wallet,
  )]
  pub destination_token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: Checked by loading with pyth
  #[account(
    constraint = input_price_oracle.verification_level == VerificationLevel::Full @ ErrorCode::PythPriceNotFound,
  )]
  pub input_price_oracle: Account<'info, PriceUpdateV2>,
  /// CHECK: Checked by loading with pyth
  #[account(
    constraint = output_price_oracle.verification_level == VerificationLevel::Full @ ErrorCode::PythPriceNotFound,
  )]
  pub output_price_oracle: Account<'info, PriceUpdateV2>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CheckRepayV0>, _args: CheckRepayArgsV0) -> Result<RunTaskReturnV0> {
  let dca = &mut ctx.accounts.dca;

  // Calculate the amount received
  let current_balance = ctx.accounts.destination_token_account.amount;
  let amount_received = current_balance
    .checked_sub(dca.pre_swap_destination_balance)
    .ok_or(ErrorCode::ArithmeticError)?;

  // Get input (source) price oracle
  let input_message = ctx.accounts.input_price_oracle.price_message;
  let current_time = Clock::get()?.unix_timestamp;

  require_gte!(
    input_message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceNotFound
  );

  let input_price = input_message.ema_price;
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let input_price_with_conf = u64::try_from(input_price)
    .unwrap()
    .checked_sub(input_message.ema_conf.checked_mul(2).unwrap())
    .unwrap();
  require_gt!(input_price_with_conf, 0);

  // Get output (target) price oracle
  let output_message = ctx.accounts.output_price_oracle.price_message;
  let output_price = output_message.ema_price;

  require_gte!(
    output_message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceNotFound
  );
  require_gt!(output_price, 0);

  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let output_price_with_conf = u64::try_from(output_price)
    .unwrap()
    .checked_sub(output_message.ema_conf.checked_mul(2).unwrap())
    .unwrap();

  // USD/Input divided by USD/Output gets us Output/Input, in other words how much output
  // we expect to receive per input.
  let output_per_input = input_price_with_conf
    .checked_div(output_price_with_conf)
    .unwrap();

  let expo_diff = input_message.exponent - output_message.exponent;
  let input_amount = dca.swap_input_amount;

  // Calculate expected output based on the input amount and oracle prices
  let expected_repayment_amount = match expo_diff.cmp(&0) {
    Ordering::Greater => input_amount
      .checked_mul(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
      .unwrap()
      .checked_mul(output_per_input)
      .unwrap(),
    Ordering::Less => input_amount
      .checked_mul(output_per_input)
      .unwrap()
      .checked_div(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
      .unwrap(),
    Ordering::Equal => input_amount.checked_mul(output_per_input).unwrap(),
  };

  let expected_repayment_amount_with_slippage = expected_repayment_amount
    - (expected_repayment_amount
      .checked_mul(u64::from(dca.slippage_bps_from_oracle))
      .unwrap()
      .checked_div(10000)
      .unwrap());

  // Verify we received at least the minimum amount after slippage
  require_gte!(
    amount_received,
    expected_repayment_amount_with_slippage,
    ErrorCode::SlippageExceeded
  );

  // Reset swap state (but keep swap_input_amount for tracking)
  dca.pre_swap_destination_balance = 0;
  dca.is_swapping = false;

  // Decrement num_orders
  dca.num_orders = dca
    .num_orders
    .checked_sub(1)
    .ok_or(ErrorCode::InvalidNumOrders)?;

  // Schedule next task if there are orders remaining
  if dca.num_orders > 0 {
    let next_time = Clock::get()?
      .unix_timestamp
      .checked_add(dca.interval_seconds as i64)
      .ok_or(ErrorCode::ArithmeticError)?;

    dca.trigger_time = next_time;

    Ok(RunTaskReturnV0 {
      tasks: vec![TaskReturnV0 {
        trigger: TriggerV0::Timestamp(next_time),
        transaction: TransactionSourceV0::RemoteV0 {
          signer: dca.dca_signer,
          url: format!("{}/{}", dca.dca_url, dca.key()),
        },
        crank_reward: None,
        free_tasks: 3,
        description: format!("dca {}", &dca.key().to_string()[..(32 - 4)]),
      }],
      accounts: vec![],
    })
  } else {
    // No more orders, return empty
    Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    })
  }
}
