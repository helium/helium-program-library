use anchor_lang::prelude::*;
use shared_utils::ORACLE_SIGNER;
use tuktuk_program::TransactionSourceV0;

use crate::errors::ErrorCode;

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

/// The two shapes a pre task may take: a remote transaction the Helium oracle signs, or a
/// compiled transaction carrying no signer seeds.
pub fn validate_pre_task(pre_task: &TransactionSourceV0) -> Result<()> {
  match pre_task {
    TransactionSourceV0::RemoteV0 { signer, .. } => {
      require_keys_eq!(*signer, ORACLE_SIGNER, ErrorCode::InvalidPreTask)
    }
    TransactionSourceV0::CompiledV0(compiled) => {
      require!(compiled.signer_seeds.is_empty(), ErrorCode::InvalidPreTask)
    }
  }

  Ok(())
}

impl MiniFanoutV0 {
  /// The pre task to queue this cycle, checked against the rule every pre task must satisfy.
  /// Queuing reads it through here rather than off the field, so a stored pre task is held to
  /// the same rule as one being stored.
  pub fn pre_task_to_queue(&self) -> Result<Option<TransactionSourceV0>> {
    let Some(pre_task) = &self.pre_task else {
      return Ok(None);
    };
    validate_pre_task(pre_task)?;

    Ok(Some(pre_task.clone()))
  }
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

#[cfg(test)]
mod tests {
  use tuktuk_program::CompiledTransactionV0;

  use super::*;

  fn remote(signer: Pubkey) -> TransactionSourceV0 {
    TransactionSourceV0::RemoteV0 {
      url: "https://hnt-rewards.oracle.helium.io/v1/tuktuk/asset/1".to_string(),
      signer,
    }
  }

  fn compiled(signer_seeds: Vec<Vec<Vec<u8>>>) -> TransactionSourceV0 {
    TransactionSourceV0::CompiledV0(CompiledTransactionV0 {
      signer_seeds,
      ..Default::default()
    })
  }

  #[test]
  fn a_pre_task_is_oracle_signed_or_carries_no_seeds() {
    validate_pre_task(&remote(ORACLE_SIGNER)).expect("the oracle's remote transaction");
    validate_pre_task(&compiled(vec![])).expect("a compiled transaction with no seeds");

    assert!(validate_pre_task(&remote(Pubkey::new_unique())).is_err());
    assert!(validate_pre_task(&compiled(vec![vec![b"helium".to_vec(), vec![253]]])).is_err());
    // An empty group is still a group.
    assert!(validate_pre_task(&compiled(vec![vec![]])).is_err());
  }

  #[test]
  fn queuing_holds_a_stored_pre_task_to_the_same_rule() {
    let stored = |pre_task| MiniFanoutV0 {
      pre_task,
      ..Default::default()
    };

    assert!(stored(None)
      .pre_task_to_queue()
      .expect("no pre task")
      .is_none());
    assert!(stored(Some(remote(ORACLE_SIGNER)))
      .pre_task_to_queue()
      .expect("the oracle's remote transaction")
      .is_some());
    assert!(stored(Some(compiled(vec![])))
      .pre_task_to_queue()
      .expect("a compiled transaction with no seeds")
      .is_some());

    assert!(stored(Some(remote(Pubkey::new_unique())))
      .pre_task_to_queue()
      .is_err());
    assert!(
      stored(Some(compiled(vec![vec![b"helium".to_vec(), vec![253]]])))
        .pre_task_to_queue()
        .is_err()
    );
  }
}
