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
  pub bump_seed: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ConversionTargetV0 {
  pub mint: Pubkey,
  pub oracle: Pubkey,
  /// How much slippage to allow from the oracle price
  pub slipage_bps: u16,
  pub reserverd: [u64; 8],
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
