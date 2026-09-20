use anchor_lang::{
  prelude::{Pubkey, *},
  solana_program::{
    hash::hash,
    instruction::Instruction,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as IX_ID},
  },
  Discriminator,
};
use shared_utils::resize_to_fit;
use tuktuk_program::verify_running_remote_task;

use crate::{ed25519::*, error::ErrorCode, state::*, SetCurrentRewardsArgsV0};

#[derive(Accounts)]
#[instruction(args: SetCurrentRewardsArgsV0)]
pub struct SetCurrentRewardsV1<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    constraint = args.oracle_index < lazy_distributor.oracles.len() as u16 @ ErrorCode::InvalidOracleIndex,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  /// The Instruction Sysvar has not been implemented
  /// in the Anchor framework yet, so this is the safe approach.
  #[account(address = IX_ID)]
  pub sysvar_instructions: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

// The caller of this instruction needs to either
// 1. Call it with a signed compiled transaction (tuktuk)
// 2. Call it with a signed set current rewards transaction

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CompiledInstructionV0 {
  /// Index into the transaction keys array indicating the program account that executes this instruction.
  pub program_id_index: u8,
  /// Ordered indices into the transaction keys array indicating which accounts to pass to the program.
  pub accounts: Vec<u8>,
  /// The program input data.
  pub data: Vec<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CompiledTransactionV0 {
  // Accounts are ordered as follows:
  // 1. Writable signer accounts
  // 2. Read only signer accounts
  // 3. writable accounts
  // 4. read only accounts
  pub num_rw_signers: u8,
  pub num_ro_signers: u8,
  pub num_rw: u8,
  pub accounts: Vec<Pubkey>,
  pub instructions: Vec<CompiledInstructionV0>,
  /// Additional signer seeds. Should include bump. Useful for things like initializing a mint where
  /// you cannot pass a keypair.
  /// Note that these seeds will be prefixed with "custom", task_queue.key
  /// and the bump you pass and account should be consistent with this. But to save space
  /// in the instruction, they should be ommitted here. See tests for examples
  pub signer_seeds: Vec<Vec<Vec<u8>>>,
}

// This isn't actually an account, but we want anchor to put it in the IDL and serialize it with a discriminator
#[account]
#[derive(Default)]
pub struct RemoteTaskTransactionV0 {
  // A hash of [task, task_queued_at, ...remaining_accounts]
  pub verification_hash: [u8; 32],
  // NOTE: The `.accounts` should be empty here, it's instead done via
  // remaining_accounts_hash
  pub transaction: CompiledTransactionV0,
}

// This isn't actually an account, but we want anchor to put it in the IDL and serialize it with a discriminator
#[account]
#[derive(Default, Debug)]
pub struct SetCurrentRewardsTransactionV0 {
  pub lazy_distributor: Pubkey,
  pub oracle_index: u16,
  pub current_rewards: u64,
  pub asset: Pubkey,
}

pub fn handler(ctx: Context<SetCurrentRewardsV1>, args: SetCurrentRewardsArgsV0) -> Result<()> {
  let signer = ctx.accounts.lazy_distributor.oracles[usize::from(args.oracle_index)].oracle;
  let ix_index = load_current_index_checked(&ctx.accounts.sysvar_instructions.to_account_info())?;
  let ix: Instruction = load_instruction_at_checked(
    ix_index.checked_sub(1).unwrap() as usize,
    &ctx.accounts.sysvar_instructions,
  )?;

  let data = verify_ed25519_ix(&ix, signer.to_bytes().as_slice())?;
  let discriminator: [u8; 8] = data[..8].try_into().unwrap();

  if discriminator == SetCurrentRewardsTransactionV0::DISCRIMINATOR {
    let sign_args = SetCurrentRewardsTransactionV0::try_deserialize(&mut &data[..])?;
    require_eq!(
      sign_args.oracle_index,
      args.oracle_index,
      ErrorCode::InvalidOracleIndex
    );
    require_eq!(
      sign_args.current_rewards,
      args.current_rewards,
      ErrorCode::InvalidCurrentRewards
    );
    require_eq!(
      sign_args.asset,
      ctx.accounts.recipient.asset,
      ErrorCode::InvalidAsset
    );
    require_eq!(
      sign_args.lazy_distributor,
      ctx.accounts.lazy_distributor.key(),
      ErrorCode::InvalidLazyDistributor
    );
  } else if discriminator == RemoteTaskTransactionV0::DISCRIMINATOR {
    // A RemoteV0 oracle signature authorizes a reward only when it is bound, by the oracle, to the
    // task that is running and to this exact reward. Neither "an oracle signed some
    // RemoteTaskTransactionV0" nor "the task account currently reads as a RemoteV0 signed by the
    // oracle" is sufficient on its own: the signed message is replayable, and a task tuktuk runs as
    // CompiledV0 can rewrite its own account into RemoteV0 shape before this instruction inspects
    // it. So the shape is confirmed, and then the signed message is required to name the running
    // task and its accounts (via the verification hash tuktuk itself checks for a genuine RemoteV0
    // run) and to authorize this reward. The oracle appends the task as the last remaining account.
    let task_info = ctx
      .remaining_accounts
      .last()
      .ok_or_else(|| error!(ErrorCode::InvalidRemoteTask))?;
    let task = verify_running_remote_task(&ctx.accounts.sysvar_instructions, task_info, &signer)?;
    verify_remote_reward_binding(
      &ctx.accounts.sysvar_instructions,
      task_info.key(),
      task.queued_at,
      &data,
      &args,
      ctx.accounts.recipient.key(),
    )?;
  } else {
    return Err(error!(ErrorCode::InvalidDiscriminator));
  }

  // if lazy distributor has an approver, expect it as the first remaining_account
  if let Some(expected_approver) = ctx.accounts.lazy_distributor.approver {
    require!(
      !ctx.remaining_accounts.is_empty(),
      ErrorCode::InvalidApproverSignature
    );
    let approver = &ctx.remaining_accounts[0];
    require!(
      approver.key() == expected_approver,
      ErrorCode::InvalidApproverSignature
    );
    require!(approver.is_signer, ErrorCode::InvalidApproverSignature);
  }

  if ctx.accounts.recipient.current_config_version != ctx.accounts.lazy_distributor.version {
    ctx.accounts.recipient.current_config_version = ctx.accounts.lazy_distributor.version;
    ctx.accounts.recipient.current_rewards =
      vec![None; ctx.accounts.lazy_distributor.oracles.len()];
  }

  let oracle_index = usize::from(args.oracle_index);
  if let Some(current_rewards) = ctx.accounts.recipient.current_rewards[oracle_index] {
    require_gte!(
      args.current_rewards,
      current_rewards,
      ErrorCode::InvalidCurrentRewards
    );
  }

  ctx.accounts.recipient.current_rewards[oracle_index] = Some(args.current_rewards);

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.recipient,
  )?;

  Ok(())
}

/// Re-derives, from the oracle-signed `RemoteTaskTransactionV0`, that the signature authorizes this
/// call's reward under the task `run_task_v0` is running.
///
/// tuktuk only binds a RemoteV0 oracle signature to a task and its accounts, via a
/// `verification_hash` over the task key, its `queued_at`, and the account list `run_task_v0` was
/// invoked with. It performs that binding only for a task it reads as RemoteV0; a task it runs as
/// CompiledV0 gets no such check yet can leave its account reading as RemoteV0. This recomputes the
/// same hash from the running task and requires it to equal the signed one, so a signature issued
/// for any other task, or run over any other accounts, is rejected. It then requires the signed
/// transaction to carry an instruction ending in this call's `(oracle_index, current_rewards)`, the
/// trailing fields of every `set_current_rewards_wrapper_*` args, so the amount written is one the
/// oracle signed rather than one the caller chose. That instruction must also reference the
/// recipient this call writes, so the signed amount is bound to the account it is written to.
fn verify_remote_reward_binding(
  sysvar_instructions: &AccountInfo,
  task_key: Pubkey,
  task_queued_at: i64,
  message: &[u8],
  args: &SetCurrentRewardsArgsV0,
  recipient: Pubkey,
) -> Result<()> {
  let remote_tx = RemoteTaskTransactionV0::try_deserialize(&mut &message[..])?;
  let tx = &remote_tx.transaction;

  // The number of accounts tuktuk hashes: one past the highest index any instruction references,
  // over both account operands and the program id.
  let max_index = tx
    .instructions
    .iter()
    .flat_map(|ix| {
      ix.accounts
        .iter()
        .copied()
        .chain(std::iter::once(ix.program_id_index))
    })
    .max()
    .ok_or_else(|| error!(ErrorCode::InvalidRemoteTask))?;
  let num_accounts = usize::from(max_index) + 1;

  // The current top-level instruction is `run_task_v0` (verified by `verify_running_remote_task`),
  // whose accounts are [crank_turner, rent_refund, task_queue, task, system_program,
  // sysvar_instructions, ..remaining]. The signed verification hash is over the remaining accounts.
  const RUN_TASK_HEADER_ACCOUNTS: usize = 6;
  let index = load_current_index_checked(sysvar_instructions)?;
  let run_task_ix = load_instruction_at_checked(index as usize, sysvar_instructions)?;
  let hashed_accounts = run_task_ix
    .accounts
    .get(RUN_TASK_HEADER_ACCOUNTS..RUN_TASK_HEADER_ACCOUNTS + num_accounts)
    .ok_or_else(|| error!(ErrorCode::InvalidRemoteTask))?;

  // Each account is hashed as pubkey ++ writable ++ signer. Writability is derived from the
  // account's position in the compiled ordering (writable signers, read-only signers, writable,
  // read-only), and the signer byte is always 0. This is how the oracle produced the hash, so it
  // matches by construction regardless of any runtime privilege escalation (e.g. an account that is
  // also one of run_task_v0's named writable accounts).
  let rw_signers = usize::from(tx.num_rw_signers);
  let ro_signers = usize::from(tx.num_ro_signers);
  let rw = usize::from(tx.num_rw);

  let mut preimage = Vec::with_capacity(32 + 8 + num_accounts * 34);
  preimage.extend_from_slice(task_key.as_ref());
  preimage.extend_from_slice(&task_queued_at.to_le_bytes());
  for (i, meta) in hashed_accounts.iter().enumerate() {
    preimage.extend_from_slice(meta.pubkey.as_ref());
    let writable =
      i < rw_signers || (i >= rw_signers + ro_signers && i < rw_signers + ro_signers + rw);
    preimage.push(u8::from(writable));
    preimage.push(0u8);
  }
  require!(
    hash(&preimage).to_bytes() == remote_tx.verification_hash,
    ErrorCode::RemoteTaskHashMismatch
  );

  let mut authorized_reward = [0u8; 10];
  authorized_reward[..2].copy_from_slice(&args.oracle_index.to_le_bytes());
  authorized_reward[2..].copy_from_slice(&args.current_rewards.to_le_bytes());
  require!(
    tx.instructions.iter().any(|ix| {
      ix.data.ends_with(&authorized_reward)
        && ix
          .accounts
          .iter()
          .any(|&idx| hashed_accounts.get(usize::from(idx)).map(|m| m.pubkey) == Some(recipient))
    }),
    ErrorCode::RemoteRewardNotSigned
  );

  Ok(())
}

#[cfg(test)]
mod tests {
  use anchor_lang::solana_program::{
    hash::hash,
    instruction::{AccountMeta, Instruction},
    sysvar::instructions::{
      construct_instructions_data, BorrowedAccountMeta, BorrowedInstruction, ID as IX_ID,
    },
  };

  use super::*;

  const ORACLE_INDEX: u16 = 0;
  const CURRENT_REWARDS: u64 = 5_000_000;

  // A run_task_v0 instruction whose trailing accounts are the ones the reward task references. Only
  // the account list matters to the binding; verify_running_remote_task validates the program and
  // discriminator, which this unit exercises in isolation from.
  fn run_task_ix(task: Pubkey, acc0: Pubkey, acc1: Pubkey) -> Instruction {
    let mut accounts: Vec<AccountMeta> = vec![
      AccountMeta::new(Pubkey::new_unique(), true), // crank_turner
      AccountMeta::new(Pubkey::new_unique(), false), // rent_refund
      AccountMeta::new(Pubkey::new_unique(), false), // task_queue
      AccountMeta::new_readonly(task, false),       // task
      AccountMeta::new_readonly(Pubkey::new_unique(), false), // system_program
      AccountMeta::new_readonly(IX_ID, false),      // sysvar_instructions
    ];
    accounts.push(AccountMeta::new(acc0, false)); // writable, non-signer
    accounts.push(AccountMeta::new_readonly(acc1, false)); // read-only
    Instruction {
      program_id: Pubkey::new_unique(),
      accounts,
      data: vec![0u8; 8],
    }
  }

  fn sysvar_holding(ix: &Instruction) -> Vec<u8> {
    let borrowed = BorrowedInstruction {
      program_id: &ix.program_id,
      accounts: ix
        .accounts
        .iter()
        .map(|m| BorrowedAccountMeta {
          pubkey: &m.pubkey,
          is_signer: m.is_signer,
          is_writable: m.is_writable,
        })
        .collect(),
      data: &ix.data,
    };
    let mut data = construct_instructions_data(&[borrowed]);
    // Current instruction index -> 0 (the run_task_v0 instruction above).
    let end = data.len() - 2;
    data[end..].copy_from_slice(&0u16.to_le_bytes());
    data
  }

  // The oracle-signed message: one instruction referencing accounts [0, 1], whose data ends in
  // (oracle_index, current_rewards), and a verification hash independently derived here the way
  // tuktuk's run_task_v0 derives it.
  fn signed_message(task: Pubkey, queued_at: i64, acc0: Pubkey, acc1: Pubkey) -> Vec<u8> {
    let mut reward_ix_data = vec![0u8; 8]; // wrapper discriminator (unread)
    reward_ix_data.extend_from_slice(&ORACLE_INDEX.to_le_bytes());
    reward_ix_data.extend_from_slice(&CURRENT_REWARDS.to_le_bytes());

    let mut preimage = Vec::new();
    preimage.extend_from_slice(task.as_ref());
    preimage.extend_from_slice(&queued_at.to_le_bytes());
    // acc0 is in the writable region -> writable, acc1 is read-only. Neither is a signer.
    preimage.extend_from_slice(acc0.as_ref());
    preimage.extend_from_slice(&[1, 0]);
    preimage.extend_from_slice(acc1.as_ref());
    preimage.extend_from_slice(&[0, 0]);

    let remote_tx = RemoteTaskTransactionV0 {
      verification_hash: hash(&preimage).to_bytes(),
      transaction: CompiledTransactionV0 {
        num_rw_signers: 0,
        num_ro_signers: 0,
        num_rw: 1,
        accounts: vec![],
        instructions: vec![CompiledInstructionV0 {
          program_id_index: 0,
          accounts: vec![0, 1],
          data: reward_ix_data,
        }],
        signer_seeds: vec![],
      },
    };
    let mut message = Vec::new();
    remote_tx
      .try_serialize(&mut message)
      .expect("serialize message");
    message
  }

  struct Case {
    task: Pubkey,
    queued_at: i64,
    acc0: Pubkey,
    acc1: Pubkey,
    task_arg: Pubkey,
    recipient: Pubkey,
    message: Vec<u8>,
    args: SetCurrentRewardsArgsV0,
  }

  impl Case {
    fn valid() -> Self {
      let task = Pubkey::new_unique();
      let queued_at = 42;
      let acc0 = Pubkey::new_unique();
      let acc1 = Pubkey::new_unique();
      Case {
        task,
        queued_at,
        acc0,
        acc1,
        task_arg: task,
        // The signed instruction references accounts [0, 1]; the recipient is acc0.
        recipient: acc0,
        message: signed_message(task, queued_at, acc0, acc1),
        args: SetCurrentRewardsArgsV0 {
          oracle_index: ORACLE_INDEX,
          current_rewards: CURRENT_REWARDS,
        },
      }
    }

    fn run(self) -> Result<()> {
      let ix = run_task_ix(self.task, self.acc0, self.acc1);
      let mut sysvar_data = sysvar_holding(&ix);
      let mut lamports = 0u64;
      let owner = Pubkey::default();
      let sysvar = AccountInfo::new(
        &IX_ID,
        false,
        false,
        &mut lamports,
        &mut sysvar_data,
        &owner,
        false,
        0,
      );
      verify_remote_reward_binding(
        &sysvar,
        self.task_arg,
        self.queued_at,
        &self.message,
        &self.args,
        self.recipient,
      )
    }
  }

  fn err_code(err: Error) -> u32 {
    match err {
      Error::AnchorError(e) => e.error_code_number,
      _ => panic!("expected an anchor error"),
    }
  }

  #[test]
  fn accepts_reward_the_oracle_signed_for_this_task() {
    Case::valid().run().expect("valid binding");
  }

  #[test]
  fn rejects_a_signature_for_a_different_task() {
    let mut case = Case::valid();
    // The signature was issued for `case.task`; the task actually running is someone else's.
    case.task_arg = Pubkey::new_unique();
    let ix = run_task_ix(case.task_arg, case.acc0, case.acc1);
    let mut sysvar_data = sysvar_holding(&ix);
    let mut lamports = 0u64;
    let owner = Pubkey::default();
    let sysvar = AccountInfo::new(
      &IX_ID,
      false,
      false,
      &mut lamports,
      &mut sysvar_data,
      &owner,
      false,
      0,
    );
    let err = verify_remote_reward_binding(
      &sysvar,
      case.task_arg,
      case.queued_at,
      &case.message,
      &case.args,
      case.recipient,
    )
    .expect_err("must reject a foreign task");
    assert_eq!(
      err_code(err),
      ErrorCode::RemoteTaskHashMismatch as u32 + 6000
    );
  }

  #[test]
  fn rejects_a_run_over_different_accounts() {
    let mut case = Case::valid();
    // The reward's recipient (acc0) is swapped for an account the oracle never signed over.
    case.acc0 = Pubkey::new_unique();
    let err = case.run().expect_err("must reject swapped accounts");
    assert_eq!(
      err_code(err),
      ErrorCode::RemoteTaskHashMismatch as u32 + 6000
    );
  }

  #[test]
  fn rejects_an_amount_the_oracle_did_not_sign() {
    let mut case = Case::valid();
    // Hash still matches (it does not cover the amount); the amount binding must catch this.
    case.args.current_rewards = CURRENT_REWARDS + 1;
    let err = case.run().expect_err("must reject an unsigned amount");
    assert_eq!(
      err_code(err),
      ErrorCode::RemoteRewardNotSigned as u32 + 6000
    );
  }

  #[test]
  fn rejects_a_reward_written_to_an_unsigned_recipient() {
    let mut case = Case::valid();
    // The signed instruction references acc0/acc1; writing to any other recipient is not authorized,
    // even though the amount matches and the account hash is valid.
    case.recipient = Pubkey::new_unique();
    let err = case.run().expect_err("must reject an unbound recipient");
    assert_eq!(
      err_code(err),
      ErrorCode::RemoteRewardNotSigned as u32 + 6000
    );
  }
}
