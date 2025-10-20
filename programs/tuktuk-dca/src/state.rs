use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct DcaV0 {
  pub index: u16,
  pub authority: Pubkey,
  pub input_price_oracle: Pubkey,
  pub output_price_oracle: Pubkey,
  pub input_mint: Pubkey,
  pub output_mint: Pubkey,
  pub input_account: Pubkey,
  pub destination_wallet: Pubkey,
  pub is_swapping: bool,
  pub pre_swap_destination_balance: u64,
  pub swap_input_amount: u64,
  pub initial_num_orders: u32,
  pub num_orders: u32,
  pub interval_seconds: u64,
  pub next_task: Pubkey,
  pub slippage_bps_from_oracle: u16,
  pub task_queue: Pubkey,
  pub trigger_time: i64,
  pub queue_authority_bump: u8,
  pub bump: u8,
  pub dca_signer: Pubkey,
  pub dca_url: String,
}

#[macro_export]
macro_rules! dca_seeds {
  ( $dca:expr ) => {
    &[
      b"dca".as_ref(),
      $dca.authority.as_ref(),
      $dca.input_mint.as_ref(),
      $dca.output_mint.as_ref(),
      $dca.index.to_le_bytes().as_ref(),
      &[$dca.bump],
    ]
  };
}

#[macro_export]
macro_rules! queue_authority_seeds {
  ( $dca:expr ) => {
    &[b"queue_authority".as_ref(), &[$dca.queue_authority_bump]]
  };
}
