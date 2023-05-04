use anchor_lang::{prelude::*, Discriminator};
use std::str::FromStr;

use crate::MobileHotspotInfoV0;

#[derive(Accounts)]
pub struct FixMobileGenesisAccountsV0<'info> {
  #[account(address = Pubkey::from_str("had8r3DWNaxvJdJzMJVDiJykGi6GBtPhKixvvZbZAqf").unwrap())]
  pub authority: Signer<'info>,
  /// CHECK: Raw data surgery requires this
  #[account(mut)]
  pub broken_account: AccountInfo<'info>,
}

pub fn handler(ctx: Context<FixMobileGenesisAccountsV0>) -> Result<()> {
  let mut data = ctx.accounts.broken_account.data.borrow_mut();
  assert!(data.len() == 113);
  let mut clone = vec![0; 113];
  clone.clone_from_slice(&data);

  // Check only 0s after the raw data
  for byte in data[45..].iter() {
    assert!(*byte == 0);
  }

  // Move the data and add the discriminator
  data[..8].copy_from_slice(&MobileHotspotInfoV0::discriminator());
  data[8..8 + 45].copy_from_slice(&clone[0..45]);

  Ok(())
}
