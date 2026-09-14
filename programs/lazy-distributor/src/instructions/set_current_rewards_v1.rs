use anchor_lang::{
  prelude::{Pubkey, *},
  solana_program::{
    instruction::Instruction,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as IX_ID},
  },
  Discriminator,
};
use shared_utils::resize_to_fit;
use tuktuk_program::{TaskV0, TransactionSourceV0};

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

// Pinned by `tests::run_task_v0_shape` against the tuktuk client this program is built with.
const RUN_TASK_V0_DISCRIMINATOR: [u8; 8] = [52, 184, 39, 129, 126, 245, 176, 237];
const RUN_TASK_V0_TASK_ACCOUNT: usize = 3;

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
    // The running task must be a RemoteV0 task signed by this oracle. tuktuk binds the signed
    // message to that task and its accounts, and it has already verified the ed25519
    // instruction against the task signer, so tuktuk's check is the authoritative one. The
    // verify_ed25519_ix parse above only picks this branch and repeats that signer check.
    let run_task_ix: Instruction =
      load_instruction_at_checked(ix_index as usize, &ctx.accounts.sysvar_instructions)?;
    require_keys_eq!(
      run_task_ix.program_id,
      tuktuk_program::tuktuk::ID,
      ErrorCode::InvalidRemoteTask
    );
    require!(
      run_task_ix.data.starts_with(&RUN_TASK_V0_DISCRIMINATOR),
      ErrorCode::InvalidRemoteTask
    );
    let task_key = run_task_ix
      .accounts
      .get(RUN_TASK_V0_TASK_ACCOUNT)
      .ok_or_else(|| error!(ErrorCode::InvalidRemoteTask))?
      .pubkey;
    let task_info = ctx
      .remaining_accounts
      .iter()
      .find(|acc| acc.key() == task_key)
      .ok_or_else(|| error!(ErrorCode::InvalidRemoteTask))?;
    require_keys_eq!(
      *task_info.owner,
      tuktuk_program::tuktuk::ID,
      ErrorCode::InvalidRemoteTask
    );
    let task = TaskV0::try_deserialize(&mut &task_info.data.borrow()[..])?;
    require!(
      matches!(
        task.transaction,
        TransactionSourceV0::RemoteV0 { signer: task_signer, .. } if task_signer == signer
      ),
      ErrorCode::InvalidRemoteTask
    );
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

#[cfg(test)]
mod tests {
  use anchor_lang::ToAccountMetas;

  use super::*;

  /// The two facts the remote task check reads out of tuktuk's run_task_v0 instruction.
  #[test]
  fn run_task_v0_shape() {
    assert_eq!(
      RUN_TASK_V0_DISCRIMINATOR,
      tuktuk_program::tuktuk::client::args::RunTaskV0::DISCRIMINATOR,
    );
    let task = Pubkey::new_unique();
    let metas = tuktuk_program::tuktuk::client::accounts::RunTaskV0 {
      crank_turner: Pubkey::new_unique(),
      rent_refund: Pubkey::new_unique(),
      task_queue: Pubkey::new_unique(),
      task,
      system_program: Pubkey::new_unique(),
      sysvar_instructions: Pubkey::new_unique(),
    }
    .to_account_metas(None);
    assert_eq!(
      metas.iter().position(|m| m.pubkey == task),
      Some(RUN_TASK_V0_TASK_ACCOUNT),
    );
  }
}
