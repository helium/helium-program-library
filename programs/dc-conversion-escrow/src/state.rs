use anchor_lang::prelude::*;

#[account]
#[derive(Default, InitSpace)]
pub struct ConversionEscrowV0 {
  pub escrow: Pubkey,
  pub mint: Pubkey,
  /// How much slippage to allow from the oracle price
  pub slipage_bps: u16,
  pub oracle: Pubkey,
  pub owner: Pubkey,
  pub data_credits: Pubkey,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! escrow_seeds {
  ( $escrow:expr ) => {
    &[
      "conversion_escrow".as_bytes(),
      $escrow.data_credits.as_ref(),
      $escrow.mint.as_ref(),
      $escrow.owner.as_ref(),
      &[$escrow.bump_seed],
    ]
  };
}
