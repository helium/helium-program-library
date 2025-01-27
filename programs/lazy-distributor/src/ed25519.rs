use anchor_lang::{
  prelude::*,
  solana_program::{ed25519_program::ID as ED25519_ID, instruction::Instruction},
  Discriminator,
};

use crate::error::ErrorCode;

/// Verify Ed25519Program instruction and get the data from it
pub fn verify_ed25519_ix(ix: &Instruction, pubkey: &[u8]) -> Result<Vec<u8>> {
  if ix.program_id != ED25519_ID {
    return Err(error!(ErrorCode::SigVerificationFailed));
  }

  check_ed25519_data(&ix.data, pubkey)
}

/// Verify serialized Ed25519Program instruction data
pub fn check_ed25519_data(data: &[u8], pubkey: &[u8]) -> Result<Vec<u8>> {
  // According to this layout used by the Ed25519Program
  // https://github.com/solana-labs/solana-web3.js/blob/master/src/ed25519-program.ts#L33

  // "Deserializing" byte slices

  let num_signatures = &[data[0]]; // Byte  0
  let padding = &[data[1]]; // Byte  1
  let signature_offset = &data[2..=3]; // Bytes 2,3
  let signature_instruction_index = &data[4..=5]; // Bytes 4,5
  let public_key_offset = &data[6..=7]; // Bytes 6,7
  let public_key_instruction_index = &data[8..=9]; // Bytes 8,9
  let message_instruction_index = &data[14..=15]; // Bytes 14,15

  let data_pubkey = &data[16..16 + 32]; // Bytes 16..16+32
  let data_msg = &data[112..]; // Bytes 112..end

  let exp_public_key_offset: u16 = 16; // 2*u8 + 7*u16
  let exp_signature_offset: u16 = exp_public_key_offset + pubkey.len() as u16;
  let exp_num_signatures: u8 = 1;

  // Header
  if num_signatures != &[exp_num_signatures]
    || padding != &[0u8]
    || signature_offset != exp_signature_offset.to_le_bytes()
    || signature_instruction_index != u16::MAX.to_le_bytes()
    || public_key_offset != exp_public_key_offset.to_le_bytes()
    || public_key_instruction_index != u16::MAX.to_le_bytes()
    || message_instruction_index != u16::MAX.to_le_bytes()
  {
    return Err(error!(ErrorCode::SigVerificationFailed));
  }

  // Arguments
  if data_pubkey != pubkey {
    return Err(error!(ErrorCode::SigVerificationFailed));
  }

  Ok(data_msg.to_vec())
}

// The caller of this instruction needs to either
// 1. Call it with a signed compiled transaction (tuktuk)
// 2. Call it with a signed set current rewards transaction

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CompiledInstructionV0 {
  /// Index into the transaction keys array indicating the program account that executes this instruction.
  pub program_id_index: u8,
  /// Ordered indices into the transaction keys array indicating which accounts to pass to the program.
  pub accounts: Vec<u8>,
  /// The program input data.
  pub data: Vec<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
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
#[derive(Default)]
pub struct SetCurrentRewardsTransactionV0 {
  pub lazy_distributor: Pubkey,
  pub oracle_index: u16,
  pub current_rewards: u64,
  pub asset: Pubkey,
}

pub enum Ed25519Verified {
  /// A signed set current rewards transaction
  SetCurrentRewards(SetCurrentRewardsTransactionV0),
  /// A signed compiled transaction from tuktuk. When this variant is returned,
  /// we trust that tuktuk called us correctly, and that the signer meant for us
  /// to be called with whatever we currently have as args. Just make sure that
  /// it's actually tuktuk calling us.
  RemoteTask(RemoteTaskTransactionV0),
}

pub fn verify_and_parse_ed25519_ix(ix: &Instruction, pubkey: &[u8]) -> Result<Ed25519Verified> {
  let data = verify_ed25519_ix(ix, pubkey)?;
  let discriminator: [u8; 8] = data[..8].try_into().unwrap();

  if discriminator == SetCurrentRewardsTransactionV0::discriminator() {
    Ok(Ed25519Verified::SetCurrentRewards(
      SetCurrentRewardsTransactionV0::deserialize(&mut &data[..])?,
    ))
  } else if discriminator == RemoteTaskTransactionV0::discriminator() {
    Ok(Ed25519Verified::RemoteTask(
      RemoteTaskTransactionV0::deserialize(&mut &data[..])?,
    ))
  } else {
    Err(error!(ErrorCode::InvalidDiscriminator))
  }
}
