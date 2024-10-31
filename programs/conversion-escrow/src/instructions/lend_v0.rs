use std::cmp::Ordering;

use anchor_lang::{
  prelude::*,
  solana_program::{
    sysvar,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
  },
};
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{errors::ErrorCode, escrow_seeds, ConversionEscrowV0};

pub const TESTING: bool = std::option_env!("TESTING").is_some();

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
    has_one = owner,
  )]
  pub conversion_escrow: Box<Account<'info, ConversionEscrowV0>>,
  pub owner: Signer<'info>,
  #[account(mut)]
  pub escrow: Account<'info, TokenAccount>,
  /// CHECK: Checked via pyth
  pub oracle: Account<'info, PriceUpdateV2>,
  /// CHECK: Checked via pyth
  #[account(
    constraint = conversion_escrow.targets.iter().any(|t| t.oracle == target_oracle.key())
  )]
  pub target_oracle: Account<'info, PriceUpdateV2>,
  pub mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    token::mint = mint
  )]
  pub destination: Box<Account<'info, TokenAccount>>,
  #[account(
    constraint = conversion_escrow.targets.iter().find(|t| t.oracle == target_oracle.key()).unwrap().mint == repay_account.mint @ ErrorCode::IncorrectRepaymentMint,
    constraint = repay_account.owner == conversion_escrow.owner @ ErrorCode::IncorrectRepaymentOwner
  )]
  pub repay_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: check instructions account
  #[account(address = sysvar::instructions::ID @ErrorCode::BadInstructionsAccount)]
  pub instructions: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<LendV0>, args: LendArgsV0) -> Result<()> {
  let ixs = ctx.accounts.instructions.to_account_info();

  let price_feed = &mut ctx.accounts.oracle;
  let message = price_feed.price_message;

  let current_time = Clock::get()?.unix_timestamp;
  require_gte!(
    message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceNotFound
  );
  let source_price = message.ema_price;
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let source_price_with_conf = u64::try_from(source_price)
    .unwrap()
    .checked_sub(message.ema_conf.checked_mul(2).unwrap())
    .unwrap();

  require_gt!(source_price_with_conf, 0);

  let target_price_oracle = &mut ctx.accounts.target_oracle;
  let target_message = target_price_oracle.price_message;

  let target_price = target_message.ema_price;
  require_gte!(
    target_message
      .publish_time
      .saturating_add(if TESTING { 6000000 } else { 10 * 60 }.into()),
    current_time,
    ErrorCode::PythPriceNotFound
  );

  require_gt!(target_price, 0);

  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let target_price_with_conf = u64::try_from(target_price)
    .unwrap()
    .checked_sub(target_message.ema_conf.checked_mul(2).unwrap())
    .unwrap();

  // USD/Sorce divided by USD/Target gets us Target/Source, in other words how much target
  // we expect to be repaid per source.
  let target_per_source = source_price_with_conf
    .checked_div(target_price_with_conf)
    .unwrap();
  let expo_diff = message.exponent - target_message.exponent;
  let expected_repayment_amount = match expo_diff.cmp(&0) {
    Ordering::Greater => args
      .amount
      .checked_mul(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
      .unwrap()
      .checked_mul(target_per_source)
      .unwrap(),
    Ordering::Less => args
      .amount
      .checked_mul(target_per_source)
      .unwrap()
      .checked_div(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
      .unwrap(),
    Ordering::Equal => args.amount.checked_mul(target_per_source).unwrap(),
  };
  let target = ctx
    .accounts
    .conversion_escrow
    .targets
    .iter()
    .find(|target| target.oracle == ctx.accounts.target_oracle.key())
    .unwrap();
  let expected_repayment_amount_with_slippage = expected_repayment_amount
    - (expected_repayment_amount
      .checked_mul(u64::from(target.slippage_bps))
      .unwrap()
      .checked_div(10000)
      .unwrap());

  // Accounting for multiple flash loans in the same tx, just need to up the expected repay. Only set initial
  // balance once.
  if ctx.accounts.conversion_escrow.temp_repay_balance == 0 {
    ctx.accounts.conversion_escrow.temp_repay_balance = ctx.accounts.repay_account.amount;
  }
  ctx.accounts.conversion_escrow.temp_expected_repay += expected_repayment_amount_with_slippage;

  let current_index = load_current_index_checked(&ixs)? as usize;
  // Search for the repayment instruction that should follow this lend instruction
  let repay_function_hash = get_function_hash("global", "check_repay_v0");

  // Start checking from the next instruction (skipping the current lend instruction)
  for index in (current_index + 1).. {
    match load_instruction_at_checked(index, &ixs) {
      Ok(ix) => {
        // Check if this is our repayment instruction
        if ix.program_id == crate::id()
          && ix.data[0..8] == repay_function_hash
          && ix.accounts[0].pubkey == ctx.accounts.conversion_escrow.key()
          && ix.accounts[1].pubkey == ctx.accounts.repay_account.key()
        {
          break;
        }
      }
      Err(_) => return Err(ErrorCode::MissingRepay.into()),
    }
  }

  // Send the loan
  transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.escrow.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.conversion_escrow.to_account_info(),
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
