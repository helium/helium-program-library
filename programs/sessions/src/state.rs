use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct SessionManagerV0 {
  pub authority: Pubkey,
  pub task_queue: Pubkey,
  pub max_session_expiration_ts: u64,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct SessionV0 {
  pub wallet: Pubkey,
  pub temporary_authority: Pubkey,
  pub expiration_ts: u64,
  pub bump_seed: u8,
  pub rent_refund: Pubkey,
  pub application: String,
  pub permissions: Vec<String>,
}

impl SessionV0 {
  pub fn is_valid(&self) -> bool {
    self.expiration_ts > Clock::get().unwrap().unix_timestamp as u64
  }
}

#[macro_export]
macro_rules! session_manager_seeds {
  ( $session_manager:expr ) => {
    &[b"session_manager".as_ref(), &[$session_manager.bump_seed]]
  };
}

#[macro_export]
macro_rules! session_seeds {
  ( $session:expr ) => {
    &[
      b"session".as_ref(),
      $session.application.to_le_bytes().as_ref(),
      $session.wallet.as_ref(),
      &[$session.bump_seed],
    ]
  };
}
