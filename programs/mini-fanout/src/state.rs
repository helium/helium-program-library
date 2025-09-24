use anchor_lang::prelude::*;
use tuktuk_program::TransactionSourceV0;

// ["global_state"]
#[account]
#[derive(Default)]
pub struct GlobalStateV0 {
  pub authority: Pubkey,
  pub task_queue: Pubkey,
  pub bump: u8,
}

// ["fanout", hash(name)]
#[account]
#[derive(Default)]
pub struct MiniFanoutV0 {
  /// The authority that can modify the fanout configuration
  pub owner: Pubkey,
  pub namespace: Pubkey,
  pub mint: Pubkey,
  pub token_account: Pubkey,
  pub task_queue: Pubkey,
  // If next task is set to mini_fanout.key(), it means there's no next task.
  // The reason we do this is because you can't set Pubkey::default() as mutable,
  // which means on `close` you'd need conditional mutability logic, which plays horribly with idls.
  pub next_task: Pubkey,
  pub rent_refund: Pubkey,
  /// Bump seed for PDA derivation
  pub bump: u8,
  pub schedule: String,
  /// Bump seed for queue authority PDA derivation
  pub queue_authority_bump: u8,
  pub shares: Vec<MiniFanoutShareV0>,
  pub seed: Vec<u8>,
  pub next_pre_task: Pubkey,
  pub pre_task: Option<TransactionSourceV0>,
}

#[account]
#[derive(Default, Debug, Eq, PartialEq)]
pub struct MiniFanoutShareV0 {
  pub wallet: Pubkey,
  pub delegate: Pubkey,
  pub share: Share,
  // dust is the amount of tokens that are not divisible by the total shares. Taken to 12 additional decimal places, we attempt to add these back in to the mix
  pub total_dust: u64,
  // total owed is the amount we weren't able to transfer due to ATA not existing
  pub total_owed: u64,
}

impl MiniFanoutShareV0 {
  pub fn destination(&self) -> Pubkey {
    if self.delegate == Pubkey::default() {
      self.wallet
    } else {
      self.delegate
    }
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Eq, PartialEq, Clone)]
pub enum Share {
  Share { amount: u32 },
  Fixed { amount: u64 },
}

impl Default for Share {
  fn default() -> Self {
    Share::Share { amount: 0 }
  }
}

#[macro_export]
macro_rules! fanout_seeds {
  ($fanout:expr) => {
    &[
      b"mini_fanout",
      $fanout.namespace.as_ref(),
      $fanout.seed.as_slice(),
      &[$fanout.bump],
    ]
  };
}

#[macro_export]
macro_rules! queue_authority_seeds {
  ($fanout:expr) => {
    &[b"queue_authority", &[$fanout.queue_authority_bump]]
  };
}
