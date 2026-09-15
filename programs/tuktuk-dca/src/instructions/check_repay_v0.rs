use anchor_lang::{prelude::*, solana_program::sysvar::instructions::ID as IX_ID};
use anchor_spl::token::{Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use tuktuk_program::{
  types::TransactionSourceV0, RunTaskReturnV0, TaskReturnV0, TaskV0, TriggerV0,
};

use crate::{
  dca_seeds, errors::ErrorCode, instructions::lend_v0::verify_running_in_tuktuk, state::*, TESTING,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CheckRepayArgsV0 {}

#[derive(Accounts)]
#[instruction(args: CheckRepayArgsV0)]
pub struct CheckRepayV0<'info> {
  #[account(
    mut,
    has_one = destination_token_account,
    has_one = input_price_oracle,
    has_one = output_price_oracle,
    has_one = next_task,
    has_one = input_account,
    has_one = rent_refund,
  )]
  pub dca: AccountLoader<'info, DcaV0>,
  #[account(
    mut,
    // Ensure that the _exact_ task we queued at initialize is being executed.
    constraint = next_task.queued_at == dca.load()?.queued_at,
  )]
  pub next_task: Account<'info, TaskV0>,
  #[account(
    mut,
    constraint = input_account.mint == dca.load()?.input_mint,
    constraint = input_account.owner == dca.key(),
  )]
  pub input_account: Account<'info, TokenAccount>,
  /// CHECK: Rent refund destination
  #[account(mut)]
  pub rent_refund: UncheckedAccount<'info>,
  #[account(mut)]
  pub destination_token_account: Account<'info, TokenAccount>,
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
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  #[account(address = IX_ID)]
  pub instruction_sysvar: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CheckRepayV0>, _args: CheckRepayArgsV0) -> Result<RunTaskReturnV0> {
  let dca_key = ctx.accounts.dca.key();
  let mut dca = ctx.accounts.dca.load_mut()?;
  // The binding comes before the state check so that a call from outside the DCA's own task is
  // refused whatever state the DCA is in.
  verify_running_in_tuktuk(
    ctx.accounts.instruction_sysvar.to_account_info(),
    dca.next_task,
  )?;
  require_eq!(dca.is_swapping, 1, ErrorCode::LendNotCalled);
  let authority = dca.authority;
  let input_mint = dca.input_mint;
  let output_mint = dca.output_mint;
  let index = dca.index;
  let bump = dca.bump;

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

  let input_price = input_message.price;
  require_gt!(input_price, 0, ErrorCode::PythPriceNotFound);
  let input_price_with_conf = u64::try_from(input_price).map_err(|_| ErrorCode::ArithmeticError)?;

  // Get output (target) price oracle
  let output_message = ctx.accounts.output_price_oracle.price_message;
  let output_price = output_message.price;

  require_gte!(
    output_message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceNotFound
  );
  require_gt!(output_price, 0, ErrorCode::PythPriceNotFound);

  let output_price_with_conf =
    u64::try_from(output_price).map_err(|_| ErrorCode::ArithmeticError)?;

  // The price ratio is a ratio of two prices in whole tokens, and the amounts on either side of
  // it are minor units. One signed power of ten carries both: the difference between the two
  // Pyth exponents, and the difference between the two mints' decimals.
  let scale = i32::from(dca.output_decimals)
    .checked_sub(i32::from(dca.input_decimals))
    .and_then(|decimal_diff| {
      input_message
        .exponent
        .checked_sub(output_message.exponent)
        .and_then(|expo_diff| expo_diff.checked_add(decimal_diff))
    })
    .ok_or(ErrorCode::ArithmeticError)?;
  let scale_factor = 10_u64
    .checked_pow(scale.unsigned_abs())
    .ok_or(ErrorCode::ArithmeticError)?;
  let input_amount = dca.swap_input_amount;

  // Calculate expected output based on the input amount and oracle prices
  // We multiply by input price first, then divide by output price to avoid integer truncation
  let expected_repayment_amount = if scale > 0 {
    input_amount
      .checked_mul(scale_factor)
      .and_then(|amount| amount.checked_mul(input_price_with_conf))
      .and_then(|amount| amount.checked_div(output_price_with_conf))
  } else {
    // `scale_factor` is 1 when the two exponents and the two decimals cancel out.
    input_amount
      .checked_mul(input_price_with_conf)
      .and_then(|amount| amount.checked_div(output_price_with_conf))
      .and_then(|amount| amount.checked_div(scale_factor))
  }
  .ok_or(ErrorCode::ArithmeticError)?;

  let expected_repayment_amount_with_slippage = expected_repayment_amount
    .checked_mul(u64::from(dca.slippage_bps_from_oracle))
    .and_then(|slippage| slippage.checked_div(10000))
    .and_then(|slippage| expected_repayment_amount.checked_sub(slippage))
    .ok_or(ErrorCode::ArithmeticError)?;

  // Verify we received at least the minimum amount after slippage
  require_gte!(
    amount_received,
    expected_repayment_amount_with_slippage,
    ErrorCode::SlippageExceeded
  );

  msg!(
    "Swap of {} input tokens to {} output tokens successful",
    input_amount,
    amount_received
  );

  // Reset swap state (but keep swap_input_amount for tracking)
  dca.pre_swap_destination_balance = 0;
  dca.is_swapping = 0;

  // Decrement num_orders
  dca.num_orders = dca
    .num_orders
    .checked_sub(1)
    .ok_or(ErrorCode::InvalidNumOrders)?;

  // Schedule next task if there are orders remaining
  if dca.num_orders > 0 {
    let now = Clock::get()?.unix_timestamp;
    let next_time = now
      .checked_add(dca.interval_seconds as i64)
      .ok_or(ErrorCode::ArithmeticError)?;

    dca.queued_at = now;
    dca.next_task = ctx
      .remaining_accounts
      .first()
      .ok_or(ErrorCode::MissingNextTask)?
      .key();

    let dca_url = String::from_utf8(dca.dca_url.to_vec())
      .map_err(|_| error!(ErrorCode::InvalidDcaUrl))?
      .replace("\0", "");
    Ok(RunTaskReturnV0 {
      tasks: vec![TaskReturnV0 {
        trigger: TriggerV0::Timestamp(next_time),
        transaction: TransactionSourceV0::RemoteV0 {
          signer: dca.dca_signer,
          url: format!("{}/{}", dca_url, dca_key),
        },
        crank_reward: None,
        free_tasks: 1,
        description: format!("dca {}", &dca_key.to_string()[..(32 - 4)]),
      }],
      accounts: vec![],
    })
  } else {
    drop(dca);

    anchor_spl::token::close_account(CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      anchor_spl::token::CloseAccount {
        account: ctx.accounts.input_account.to_account_info(),
        destination: ctx.accounts.rent_refund.to_account_info(),
        authority: ctx.accounts.dca.to_account_info(),
      },
      &[dca_seeds!(authority, input_mint, output_mint, index, bump)],
    ))?;

    ctx
      .accounts
      .dca
      .close(ctx.accounts.rent_refund.to_account_info())?;

    // No more orders, return empty
    Ok(RunTaskReturnV0 {
      tasks: vec![],
      accounts: vec![],
    })
  }
}
