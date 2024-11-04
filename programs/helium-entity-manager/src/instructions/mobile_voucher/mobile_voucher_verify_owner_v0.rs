/// Verify the owner and top them up with SOL if need be.
use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::token::Token;

use crate::{error::ErrorCode, state::*, ECC_VERIFIER};

// 0.02 SOL minus the rent
const MIN_WALLET_LAMPORTS: u64 = 20_000_000;

#[derive(Accounts)]
pub struct MobileVoucherVerifyOwnerV0<'info> {
  #[account(mut)]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(address = Pubkey::from_str(ECC_VERIFIER).unwrap())]
  pub ecc_verifier: Signer<'info>,
  /// CHECK: Ecc verifier is what's telling us this is the owner
  #[account(mut)]
  pub verified_owner: UncheckedAccount<'info>,
  #[account(
    mut,
    has_one = maker,
    // Make sure this hasn't been verified yet
    constraint = mobile_hotspot_voucher.verified_owner == maker.issuing_authority,
  )]
  pub mobile_hotspot_voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MobileVoucherVerifyOwnerV0>) -> Result<()> {
  ctx.accounts.mobile_hotspot_voucher.verified_owner = ctx.accounts.verified_owner.key();
  require_gte!(
    MIN_WALLET_LAMPORTS,
    ctx.accounts.maker.expected_onboard_amount,
    ErrorCode::TooMuchBorrowed
  );
  if ctx.accounts.verified_owner.lamports() < MIN_WALLET_LAMPORTS {
    let maker = ctx.accounts.maker.to_account_info();
    let mut maker_lamports = maker.try_borrow_mut_lamports()?;
    let maker_data_len = ctx.accounts.maker.to_account_info().data_len();
    let rent = Rent::get()?.minimum_balance(maker_data_len);
    let maker_spare_lamports = **maker_lamports - rent;
    if maker_spare_lamports > MIN_WALLET_LAMPORTS {
      **maker_lamports -= MIN_WALLET_LAMPORTS;
      let owner_wallet = ctx.accounts.verified_owner.to_account_info();
      let mut wallet_lamports = owner_wallet.try_borrow_mut_lamports()?;
      **wallet_lamports += MIN_WALLET_LAMPORTS;
    }
  }
  ctx.accounts.maker.expected_onboard_amount = 0;
  Ok(())
}
