use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct FanoutV0 {
  pub authority: Pubkey,
  pub token_account: Pubkey,
  pub membership_mint: Pubkey,
  pub total_shares: u64,
  pub total_staked_shares: u64,
  // Collection of NFTs minted representing a receipt voucher
  pub membership_collection: Pubkey,
  pub total_inflow: u64,
  pub last_snapshot_amount: u64,
  pub name: String,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct FanoutVoucherV0 {
  pub fanout: Pubkey,
  pub mint: Pubkey,
  pub stake_account: Pubkey,
  pub shares: u64,
  pub total_inflow: u64,
  pub total_distributed: u64,
  // dust is the amount of tokens that are not divisible by the total shares. Taken to 12 additional decimal places, we attempt to add these back in to the mix
  pub total_dust: u64,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! voucher_seeds {
  ( $voucher:expr ) => {
    &[
      b"fanout_voucher".as_ref(),
      $voucher.mint.as_ref(),
      &[$voucher.bump_seed],
    ]
  };
}

#[macro_export]
macro_rules! fanout_seeds {
  ( $fanout:expr ) => {
    &[
      b"fanout".as_ref(),
      $fanout.name.as_bytes(),
      &[$fanout.bump_seed],
    ]
  };
}
