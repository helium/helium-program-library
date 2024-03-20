use crate::errors::ErrorCode;
use crate::{escrow_seeds, ConversionEscrowV0};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use anchor_lang::solana_program::sysvar::instructions::{
  load_current_index_checked, load_instruction_at_checked,
};
use anchor_spl::token::{self, transfer, Mint, Token, TokenAccount, Transfer};
use pyth_sdk_solana::load_price_feed_from_account_info;
use spl_token::instruction::TokenInstruction;

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
  )]
  pub conversion_escrow: Box<Account<'info, ConversionEscrowV0>>,
  #[account(mut)]
  pub escrow: Account<'info, TokenAccount>,
  /// CHECK: Checked via pyth
  pub oracle: UncheckedAccount<'info>,
  /// CHECK: Checked via pyth
  #[account(
    constraint = conversion_escrow.targets.iter().any(|t| t.oracle == target_oracle.key())
  )]
  pub target_oracle: UncheckedAccount<'info>,
  pub mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    token::mint = mint
  )]
  pub destination: Box<Account<'info, TokenAccount>>,
  #[account(
    constraint = conversion_escrow.targets.iter().find(|t| t.oracle == target_oracle.key()).unwrap().mint == repay_account.mint,
    constraint = repay_account.owner == conversion_escrow.owner
  )]
  pub repay_account: Box<Account<'info, TokenAccount>>,
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
  let source_price = price_feed
    .get_ema_price_no_older_than(current_time, if TESTING { 6000000 } else { 10 * 60 })
    .ok_or_else(|| error!(ErrorCode::PythPriceNotFound))?;
  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let source_price_with_conf = u64::try_from(source_price.price)
    .unwrap()
    .checked_sub(source_price.conf.checked_mul(2).unwrap())
    .unwrap();

  require_gt!(source_price_with_conf, 0);

  let target_price_oracle = load_price_feed_from_account_info(&ctx.accounts.target_oracle)
    .map_err(|e| {
      msg!("Pyth error {}", e);
      error!(ErrorCode::PythError)
    })?;

  let target_price = target_price_oracle
    .get_ema_price_no_older_than(current_time, if TESTING { 6000000 } else { 10 * 60 })
    .ok_or_else(|| error!(ErrorCode::PythPriceNotFound))?;

  require_gt!(target_price.price, 0);

  // Remove the confidence from the price to use the most conservative price
  // https://docs.pyth.network/price-feeds/solana-price-feeds/best-practices#confidence-intervals
  let target_price_with_conf = u64::try_from(target_price.price)
    .unwrap()
    .checked_sub(target_price.conf.checked_mul(2).unwrap())
    .unwrap();

  // USD/Sorce divided by USD/Target gets us Target/Source, in other words how much target
  // we expect to be repaid per source.
  let target_per_source = source_price_with_conf
    .checked_div(target_price_with_conf)
    .unwrap();
  let expo_diff = source_price.expo - target_price.expo;
  let expected_repayment_amount = if expo_diff > 0 {
    // Target has more decimals than source, need to multiply
    args
      .amount
      .checked_mul(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
      .unwrap()
      .checked_mul(target_per_source)
      .unwrap()
  } else if expo_diff < 0 {
    // Target has less decimals than source, need to divide
    args
      .amount
      .checked_mul(target_per_source)
      .unwrap()
      .checked_div(10_u64.pow(u32::try_from(expo_diff.abs()).unwrap()))
      .unwrap()
  } else {
    // Same decimals
    args.amount.checked_mul(target_per_source).unwrap()
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
      .checked_mul(u64::from(target.slipage_bps))
      .unwrap()
      .checked_div(10000)
      .unwrap());

  // make sure this isnt a cpi call
  let current_index = load_current_index_checked(&ixs)? as usize;
  // loop through instructions, looking for an equivalent mint dc to this borrow
  let mut index = current_index + 1; // jupiter swap
  loop {
    // get the next instruction, die if theres no more
    if let Ok(ix) = load_instruction_at_checked(index, &ixs) {
      if ix.program_id == token::ID {
        let transfer_data = match TokenInstruction::unpack(&ix.data)? {
          TokenInstruction::Transfer { amount } => Some((amount, ix.accounts[1].pubkey)),
          TokenInstruction::TransferChecked { amount, .. } => Some((amount, ix.accounts[2].pubkey)),
          _ => None,
        };

        if let Some((amount, account)) = transfer_data {
          if ctx.accounts.repay_account.key() == account {
            require_gt!(amount, expected_repayment_amount_with_slippage);
            break;
          }
        }
      }
    } else {
      // no more instructions, so we're missing a repay
      return Err(ErrorCode::MissingRepay.into());
    }

    index += 1
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
