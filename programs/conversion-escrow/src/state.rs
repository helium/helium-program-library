use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ConversionEscrowV0 {
  pub escrow: Pubkey,
  pub mint: Pubkey,
  pub oracle: Pubkey,
  pub owner: Pubkey,
  pub update_authority: Pubkey,
  pub targets: Vec<ConversionTargetV0>,
  /// Temporarily records the balance of the repay account to check if it has been repaid
  pub temp_repay_balance: u64,
  /// Temporarily records the amount we expect to be repaid
  pub temp_expected_repay: u64,
  pub bump_seed: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ConversionTargetV0 {
  pub mint: Pubkey,
  pub oracle: Pubkey,
  /// How much slippage to allow from the oracle price
  pub slippage_bps: u16,
  pub reserved: [u64; 8],
}

#[macro_export]
macro_rules! escrow_seeds {
  ( $escrow:expr ) => {
    &[
      "conversion_escrow".as_bytes(),
      $escrow.mint.as_ref(),
      $escrow.owner.as_ref(),
      &[$escrow.bump_seed],
    ]
  };
}
