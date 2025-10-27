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
  pub reserved: [u8; 2],
  pub dca_signer: Pubkey,
  pub dca_url: [u8; 128],
  pub rent_refund: Pubkey,
  pub crank_reward: u64,
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
