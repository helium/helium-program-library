use anchor_lang::prelude::*;

#[account(zero_copy)]
pub struct AutoTopOffV0 {
  pub authority: Pubkey,
  pub data_credits: Pubkey,
  pub task_queue: Pubkey,
  pub sub_dao: Pubkey,
  // If next task is set to auto_top_off.key(), it means there's no next task.
  // The reason we do this is because you can't set Pubkey::default() as mutable,
  // which means on `close` you'd need conditional mutability logic, which plays horribly with idls.
  pub next_task: Pubkey,     // DC topoff task
  pub next_hnt_task: Pubkey, // HNT topoff task (for DCA)
  pub delegated_data_credits: Pubkey,
  pub dc_mint: Pubkey,
  pub hnt_mint: Pubkey,
  pub dao: Pubkey,
  pub hnt_price_oracle: Pubkey,
  pub hnt_account: Pubkey,
  pub dc_account: Pubkey,
  pub escrow_account: Pubkey,
  pub circuit_breaker: Pubkey,
  pub bump: u8,
  pub queue_authority_bump: u8,
  // Seeds the next DCA PDA. Advances once per DCA created, so a DCA that fails to drain and
  // close never occupies the slot the next one needs.
  pub dca_index: u16,
  pub reserved: [u8; 4],
  pub threshold: u64,
  pub schedule: [u8; 128],
  pub dca_url: [u8; 128],
  pub dca_signer: Pubkey,
  // DCA fields
  pub hnt_threshold: u64,
  pub dca_mint: Pubkey,
  pub dca_mint_account: Pubkey,
  pub dca_swap_amount: u64,
  pub dca_interval_seconds: u64,
  pub dca_input_price_oracle: Pubkey,
  pub dca: Pubkey,
}

#[macro_export]
macro_rules! auto_top_off_seeds {
  ( $delegated_data_credits:expr, $authority:expr, $bump:expr ) => {
    &[
      b"auto_top_off".as_ref(),
      $delegated_data_credits.as_ref(),
      $authority.as_ref(),
      &[$bump],
    ]
  };
}

#[macro_export]
macro_rules! queue_authority_seeds {
  ( $queue_authority_bump:expr ) => {
    &[b"queue_authority".as_ref(), &[$queue_authority_bump]]
  };
}

#[cfg(test)]
mod tests {
  use anchor_lang::Discriminator;

  use super::*;

  /// `dca_index` is carved out of `reserved`, so every other field must sit at the byte offset
  /// it occupied before. Existing accounts are not migrated; they decode with `dca_index == 0`.
  #[test]
  fn layout_is_unchanged_for_existing_accounts() {
    let v = <AutoTopOffV0 as bytemuck::Zeroable>::zeroed();
    let base = &v as *const _ as usize;
    let at = |p: *const u8| p as usize - base + AutoTopOffV0::DISCRIMINATOR.len();

    assert_eq!(
      std::mem::size_of::<AutoTopOffV0>(),
      936,
      "struct size moved"
    );
    assert_eq!(at(&v.dca_index as *const _ as *const u8), 490);
    assert_eq!(at(&v.threshold as *const _ as *const u8), 496);
    assert_eq!(at(&v.hnt_threshold as *const _ as *const u8), 792);
    assert_eq!(at(&v.dca_mint_account as *const _ as *const u8), 832);
    assert_eq!(at(&v.dca_input_price_oracle as *const _ as *const u8), 880);
  }
}
