use anchor_lang::prelude::*;

#[account(zero_copy)]
pub struct DcaV0 {
  pub authority: Pubkey,
  pub input_price_oracle: Pubkey,
  pub output_price_oracle: Pubkey,
  pub input_mint: Pubkey,
  pub output_mint: Pubkey,
  pub input_account: Pubkey,
  pub destination_wallet: Pubkey,
  pub destination_token_account: Pubkey,
  pub pre_swap_destination_balance: u64,
  pub swap_input_amount: u64,
  pub swap_amount_per_order: u64,
  pub interval_seconds: u64,
  pub next_task: Pubkey,
  pub task_queue: Pubkey,
  pub queued_at: i64,
  pub index: u16,
  pub slippage_bps_from_oracle: u16,
  pub initial_num_orders: u32,
  pub num_orders: u32,
  pub bump: u8,
  pub is_swapping: u8,
  // Decimals of `input_mint` and `output_mint`, read off the mints at creation. The repay floor
  // is priced in output minor units, so it needs both.
  pub input_decimals: u8,
  pub output_decimals: u8,
  pub dca_signer: Pubkey,
  pub dca_url: [u8; 128],
  pub rent_refund: Pubkey,
}

#[macro_export]
macro_rules! dca_seeds {
  ( $authority:expr, $input_mint:expr, $output_mint:expr, $index:expr, $bump:expr ) => {
    &[
      b"dca".as_ref(),
      $authority.as_ref(),
      $input_mint.as_ref(),
      $output_mint.as_ref(),
      $index.to_le_bytes().as_ref(),
      &[$bump],
    ]
  };
}

#[macro_export]
macro_rules! queue_authority_seeds {
  ( $bump:expr ) => {
    &[b"queue_authority".as_ref(), &[$bump]]
  };
}

#[cfg(test)]
mod tests {
  use anchor_lang::Discriminator;

  use super::*;

  /// `input_decimals` and `output_decimals` are carved out of `reserved`, so every field sits at
  /// the byte offset it occupied before. Existing accounts are not migrated; they decode with
  /// both decimals at 0.
  #[test]
  fn layout_is_unchanged_for_existing_accounts() {
    let v = <DcaV0 as bytemuck::Zeroable>::zeroed();
    let base = &v as *const _ as usize;
    let at = |p: *const u8| p as usize - base + DcaV0::DISCRIMINATOR.len();

    assert_eq!(std::mem::size_of::<DcaV0>(), 568, "struct size moved");
    assert_eq!(at(&v.next_task as *const _ as *const u8), 296);
    assert_eq!(at(&v.input_decimals as *const _), 382);
    assert_eq!(at(&v.output_decimals as *const _), 383);
    assert_eq!(at(&v.dca_signer as *const _ as *const u8), 384);
    assert_eq!(at(&v.dca_url as *const _ as *const u8), 416);
    assert_eq!(at(&v.rent_refund as *const _ as *const u8), 544);
  }
}
