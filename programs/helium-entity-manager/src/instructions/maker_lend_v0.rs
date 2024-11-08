/// Creates a loan from the maker to whoever is onboarding,
/// but only if they are doing a valid onboarding command later on.
use std::str::FromStr;

use anchor_lang::{
  prelude::*,
  solana_program::sysvar::{self},
};
use anchor_spl::token::{Mint, Token};
use conversion_escrow::{
  cpi::{accounts::LendV0, lend_v0},
  program::ConversionEscrow,
  ConversionEscrowV0, LendArgsV0,
};

use crate::{maker_seeds, state::*};

#[derive(Accounts)]
pub struct MakerLendV0<'info> {
  #[account(mut)]
  pub maker: Box<Account<'info, MakerV0>>,
  pub source_mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked in cpi
  pub target_oracle: UncheckedAccount<'info>,
  /// CHECK: Checked in cpi
  #[account(mut)]
  pub escrow: AccountInfo<'info>,
  /// CHECK: Checked in cpi
  pub oracle: AccountInfo<'info>,
  /// CHECK: Doesn't matter where it goes, so long as it is repaid
  #[account(mut)]
  pub destination: AccountInfo<'info>,
  /// CHECK: Checked in CPI
  #[account(mut)]
  pub repay_account: AccountInfo<'info>,
  #[account(
    mut,
    seeds = [b"conversion_escrow", source_mint.key().as_ref(), maker.key().as_ref()],
    seeds::program = conversion_escrow_program,
    bump = conversion_escrow.bump_seed,
    has_one = escrow,
    has_one = oracle,
    constraint = conversion_escrow.owner == maker.key()
  )]
  pub conversion_escrow: Box<Account<'info, ConversionEscrowV0>>,
  pub conversion_escrow_program: Program<'info, ConversionEscrow>,
  /// CHECK: check instructions account
  #[account(address = sysvar::instructions::ID)]
  pub instructions: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MakerLendV0>) -> Result<()> {
  let seeds = maker_seeds!(ctx.accounts.maker);

  let target = ctx
    .accounts
    .conversion_escrow
    .targets
    .iter()
    .find(|target| target.oracle == ctx.accounts.target_oracle.key())
    .unwrap();
  let topup_amount = ctx
    .accounts
    .maker
    .topup_amounts
    .iter()
    .find(|topup| topup.mint == target.mint)
    .unwrap();
  let amount_with_slippage = topup_amount.source_amount
    + topup_amount.source_amount * u64::from(target.slippage_bps) / 10000;
  lend_v0(
    CpiContext::new_with_signer(
      ctx.accounts.conversion_escrow_program.to_account_info(),
      LendV0 {
        owner: ctx.accounts.maker.to_account_info(),
        conversion_escrow: ctx.accounts.conversion_escrow.to_account_info(),
        escrow: ctx.accounts.escrow.to_account_info(),
        mint: ctx.accounts.source_mint.to_account_info(),
        oracle: ctx.accounts.oracle.to_account_info(),
        target_oracle: ctx.accounts.target_oracle.to_account_info(),
        destination: ctx.accounts.destination.to_account_info(),
        repay_account: ctx.accounts.repay_account.to_account_info(),
        instructions: ctx.accounts.instructions.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
      &[seeds],
    ),
    LendArgsV0 {
      amount: amount_with_slippage,
    },
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
