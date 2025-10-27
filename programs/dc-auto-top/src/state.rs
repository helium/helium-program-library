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
  pub reserved: [u8; 6],
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
