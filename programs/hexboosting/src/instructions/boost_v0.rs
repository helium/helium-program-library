use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use anchor_spl::{token::{Mint, TokenAccount}, associated_token::AssociatedToken};

use crate::{BoostConfigV0, BoostedHexV0};


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostArgsV0 {
  pub location: u64,
  pub amounts: Vec<BoostAmountV0>
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostAmountV0 {
  pub period: u16,
  pub amount: u8
}


#[derive(Accounts)]
#[instruction(args: BoostAmountV0)]
pub struct BoostV0 {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    has_one = payment_mint
  )]
  pub boost_config: Box<Accoun<'info, BoostConfigV0>>,
  #[account(mut)]
  pub payment_mint: Box<Account<'info, Mint>>,
  #[account(
    associated_token::owner = payer,
    associated_token::mint = payment_mint,
  )]
  pub payment_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + 60 + std::mem::size_of<BoostedHexV0>,
    seeds = ["boosted_hex", payment_mint.key().as_ref(), args.location.to_le_bytes()],
    bump
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
  ctx: Context<BoostV0>,
  args: BoostArgsV0
) -> Result<()> {
  let is_initialized = ctx.accounts.boosted_hex.location != 0;
  ctx.accounts.boosted_hex.boost_config = ctx.accounts.boost_config.key();
  ctx.accounts.boosted_hex.location = args.location;

  // Enforce minimum
  if !is_initialized {
    for i in ctx.accounts.boost_config.minimum_periods {
      if let Some(amount) = args.amounts.get(i) {
        require_eq!(amount.period, i, ErrorCode::BelowMinimumBoost);
        require_gt!(amount.amount, 0);
      } else {
        return Err(error!(ErrorCode::BelowMinimumBoost));
      }
    }
  }

  Ok(())
}