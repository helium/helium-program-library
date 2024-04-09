/// Verify the owner and top them up with SOL if need be.
use std::str::FromStr;

use crate::{error::ErrorCode, maker_seeds, state::*, ECC_VERIFIER};
use anchor_lang::prelude::*;
use anchor_spl::token::{close_account, CloseAccount, Token};

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
  /// CHECK: Maker's wrapped sol account
  pub maker_wsol: UncheckedAccount<'info>,
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
    close_account(CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      CloseAccount {
        account: ctx.accounts.maker_wsol.to_account_info(),
        destination: ctx.accounts.verified_owner.to_account_info(),
        authority: ctx.accounts.maker.to_account_info(),
      },
      &[maker_seeds!(ctx.accounts.maker)],
    ))?;
  }
  ctx.accounts.maker.expected_onboard_amount = 0;
  Ok(())
}
