use anchor_lang::{
  prelude::{Pubkey, *},
  solana_program::{
    instruction::Instruction,
    pubkey,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as IX_ID},
  },
  Discriminator,
};
use shared_utils::resize_to_fit;

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

const TUKTUK_PID: Pubkey = pubkey!("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");

pub fn handler(ctx: Context<SetCurrentRewardsV1>, args: SetCurrentRewardsArgsV0) -> Result<()> {
  let signer = ctx.accounts.lazy_distributor.oracles[usize::from(args.oracle_index)].oracle;
  let ix_index = load_current_index_checked(&ctx.accounts.sysvar_instructions.to_account_info())?;
  let ix: Instruction = load_instruction_at_checked(
    ix_index.checked_sub(1).unwrap() as usize,
    &ctx.accounts.sysvar_instructions,
  )?;

  let data = verify_ed25519_ix(&ix, signer.to_bytes().as_slice())?;
  let discriminator: [u8; 8] = data[..8].try_into().unwrap();

  if discriminator == SetCurrentRewardsTransactionV0::discriminator() {
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
  } else if discriminator == RemoteTaskTransactionV0::discriminator() {
    let run_task_ix: Instruction =
      load_instruction_at_checked(ix_index as usize, &ctx.accounts.sysvar_instructions)?;
    require_eq!(run_task_ix.program_id, TUKTUK_PID);
  } else {
    return Err(error!(ErrorCode::InvalidDiscriminator));
  }

  // if lazy distributor has an approver, expect 1 remaining_account
  if ctx.accounts.lazy_distributor.approver.is_some() {
    require!(
      ctx.remaining_accounts.len() == 1,
      ErrorCode::InvalidApproverSignature
    );
    let approver = &ctx.remaining_accounts[0];
    require!(
      approver.key() == ctx.accounts.lazy_distributor.approver.unwrap(),
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
