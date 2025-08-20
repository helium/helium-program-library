use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct AutoTopOffV0 {
  pub authority: Pubkey,
  pub data_credits: Pubkey,
  pub task_queue: Pubkey,
  pub sub_dao: Pubkey,
  pub next_task: Pubkey,
  pub next_pyth_task: Pubkey,
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
  pub threshold: u64,
  pub schedule: String,
}

#[macro_export]
macro_rules! auto_top_off_seeds {
  ( $auto_top_off:expr ) => {
    &[
      b"auto_top_off".as_ref(),
      $auto_top_off.data_credits.as_ref(),
      $auto_top_off.sub_dao.as_ref(),
      $auto_top_off.authority.as_ref(),
      &[$auto_top_off.bump],
    ]
  };
}

#[macro_export]
macro_rules! queue_authority_seeds {
  ( $auto_top_off:expr ) => {
    &[
      b"queue_authority".as_ref(),
      &[$auto_top_off.queue_authority_bump],
    ]
  };
}
