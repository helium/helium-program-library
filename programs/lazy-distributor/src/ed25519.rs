use anchor_lang::{
  prelude::*,
  solana_program::{ed25519_program::ID as ED25519_ID, instruction::Instruction},
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
  let message_data_offset = u16::from_le_bytes(data[10..=11].try_into().unwrap()) as usize;
  let message_data_size = u16::from_le_bytes(data[12..=13].try_into().unwrap()) as usize;
  let message_instruction_index = &data[14..=15]; // Bytes 14,15

  let data_pubkey = &data[16..16 + 32]; // Bytes 16..16+32
  let data_msg = &data[message_data_offset..(message_data_offset + message_data_size)];

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
