use std::str::FromStr;

use crate::{state::*, ECC_VERIFIER};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct MobileVoucherVerifyOwnerV0<'info> {
  #[account(address = Pubkey::from_str(ECC_VERIFIER).unwrap())]
  pub ecc_verifier: Signer<'info>,
  /// CHECK: Ecc verifier is what's telling us this is the owner
  pub verified_owner: UncheckedAccount<'info>,
  #[account(mut)]
  pub mobile_hotspot_voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
}

pub fn handler(ctx: Context<MobileVoucherVerifyOwnerV0>) -> Result<()> {
  ctx.accounts.mobile_hotspot_voucher.verified_owner = ctx.accounts.verified_owner.key();
  Ok(())
}
