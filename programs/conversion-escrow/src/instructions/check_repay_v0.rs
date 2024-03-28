use crate::{errors::ErrorCode, ConversionEscrowV0};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct CheckRepayV0<'info> {
  pub conversion_escrow: Account<'info, ConversionEscrowV0>,
  /// CHECK: This is checked by lend_v0 as the second account
  pub repay_account: Box<Account<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<CheckRepayV0>) -> Result<()> {
  require_gte!(
    ctx.accounts.repay_account.amount,
    ctx.accounts.conversion_escrow.temp_expected_repay
      + ctx.accounts.conversion_escrow.temp_repay_balance,
    ErrorCode::InsufficientRepayAmount
  );
  Ok(())
}
