use anchor_lang::prelude::*;
use tuktuk_program::{CompiledTransactionV0, TaskV0, TransactionSourceV0};

/// Bytes tuktuk's `queue_task_v0` allocates for a task carrying `transaction` and
/// `description`, computed the way tuktuk computes it, so its rent is the rent tuktuk
/// charges for the task account.
pub fn task_space(transaction: &TransactionSourceV0, description: &str) -> usize {
  8 + std::mem::size_of::<TaskV0>() + transaction_size(transaction) + 4 + description.len() + 60
}

fn transaction_size(transaction: &TransactionSourceV0) -> usize {
  match transaction {
    TransactionSourceV0::CompiledV0(compiled) => 4 + compiled_transaction_size(compiled),
    TransactionSourceV0::RemoteV0 { url, .. } => 4 + 32 + 4 + url.len(),
  }
}

fn compiled_transaction_size(transaction: &CompiledTransactionV0) -> usize {
  let max_accounts = 1
    + transaction
      .instructions
      .iter()
      .flat_map(|ix| ix.accounts.iter())
      .max()
      .copied()
      .unwrap_or(transaction.accounts.len() as u8) as usize;
  let instructions: usize = transaction
    .instructions
    .iter()
    .map(|ix| 1 + 4 + ix.accounts.len() + 4 + ix.data.len())
    .sum();
  (3 + 1) + (4 + max_accounts * 32) + (4 + instructions)
}

/// Whether the queue authority, holding `lamports`, can pay the rent of a task of `space`
/// bytes and remain rent exempt itself. The crank reward is left out: the caller transfers
/// it to the queue authority before the task is queued.
pub fn queue_authority_can_pay(lamports: u64, space: usize, rent: &Rent) -> bool {
  lamports
    >= rent
      .minimum_balance(space)
      .saturating_add(rent.minimum_balance(0))
}

#[cfg(test)]
mod tests {
  use super::*;
  use tuktuk_program::CompiledInstructionV0;

  /// The bytes of a task account tuktuk allocated for a compiled transaction: the space
  /// computed from the task's own transaction and description is the account's length.
  #[test]
  fn compiled_task_matches_the_allocated_account() {
    let data = include_bytes!("../fixtures/queued_compiled_task.bin");
    let task = TaskV0::try_deserialize(&mut &data[..]).expect("deserialize task fixture");
    assert!(matches!(
      task.transaction,
      TransactionSourceV0::CompiledV0(_)
    ));
    assert_eq!(task_space(&task.transaction, &task.description), data.len());
  }

  #[test]
  fn compiled_size_counts_the_highest_account_index_used() {
    let transaction = CompiledTransactionV0 {
      num_rw_signers: 0,
      num_ro_signers: 0,
      num_rw: 1,
      accounts: vec![Pubkey::default(); 5],
      instructions: vec![CompiledInstructionV0 {
        program_id_index: 0,
        accounts: vec![0, 2],
        data: vec![7; 10],
      }],
      signer_seeds: vec![vec![b"seed".to_vec()]],
    };
    // header 4 + accounts (4 + 3 * 32) + instructions (4 + 1 + 4 + 2 + 4 + 10)
    assert_eq!(compiled_transaction_size(&transaction), 4 + 100 + 25);
  }

  #[test]
  fn compiled_size_counts_every_account_when_no_instruction_names_one() {
    let transaction = CompiledTransactionV0 {
      num_rw_signers: 0,
      num_ro_signers: 0,
      num_rw: 1,
      accounts: vec![Pubkey::default(); 2],
      instructions: vec![CompiledInstructionV0 {
        program_id_index: 0,
        accounts: vec![],
        data: vec![7; 3],
      }],
      signer_seeds: vec![],
    };
    // header 4 + accounts (4 + 3 * 32) + instructions (4 + 1 + 4 + 0 + 4 + 3)
    assert_eq!(compiled_transaction_size(&transaction), 4 + 100 + 16);
  }

  #[test]
  fn queue_authority_pays_only_when_it_stays_rent_exempt() {
    let rent = Rent::default();
    let space = 466;
    let needed = rent.minimum_balance(space) + rent.minimum_balance(0);
    assert!(queue_authority_can_pay(needed, space, &rent));
    assert!(!queue_authority_can_pay(needed - 1, space, &rent));
    // Enough for the task's rent alone is not enough.
    assert!(!queue_authority_can_pay(
      rent.minimum_balance(space),
      space,
      &rent
    ));
  }
}
