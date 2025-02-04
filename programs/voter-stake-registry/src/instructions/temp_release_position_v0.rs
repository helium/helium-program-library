use anchor_lang::prelude::*;
use solana_program::pubkey;

use crate::state::{LockupKind, PositionV0};

const PROD_DEPLOYER: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");
const IOT_REGISTRAR: Pubkey = pubkey!("7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL");
const MOBILE_REGISTRAR: Pubkey = pubkey!("C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW");

#[derive(Accounts)]
pub struct TempReleasePositionV0<'info> {
  #[account(
    address = PROD_DEPLOYER
  )]
  pub authority: Signer<'info>,
  #[account(
    mut,
    constraint = is_valid_registrar(position.registrar)
  )]
  pub position: Account<'info, PositionV0>,
}

fn is_valid_registrar(registrar: Pubkey) -> bool {
  registrar == MOBILE_REGISTRAR || registrar == IOT_REGISTRAR
}

pub fn handler(ctx: Context<TempReleasePositionV0>) -> Result<()> {
  ctx.accounts.position.lockup.end_ts = 1738195200; // 2025-01-30 at UTC midnight
  ctx.accounts.position.lockup.kind = LockupKind::Cliff;

  Ok(())
}
