use bytemuck::{bytes_of, Contiguous};
use solana_program::program_error::ProgramError;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;

use crate::*;

#[allow(dead_code)]
pub fn gen_signer_seeds<'a>(nonce: &'a u64, acc_pk: &'a Pubkey) -> [&'a [u8]; 2] {
  [acc_pk.as_ref(), bytes_of(nonce)]
}

#[allow(dead_code)]
pub fn gen_signer_key(
  nonce: u64,
  acc_pk: &Pubkey,
  program_id: &Pubkey,
) -> Result<Pubkey, ProgramError> {
  let seeds = gen_signer_seeds(&nonce, acc_pk);
  Ok(Pubkey::create_program_address(&seeds, program_id)?)
}

#[allow(dead_code)]
pub fn create_signer_key_and_nonce(program_id: &Pubkey, acc_pk: &Pubkey) -> (Pubkey, u64) {
  for i in 0..=u64::MAX_VALUE {
    if let Ok(pk) = gen_signer_key(i, acc_pk, program_id) {
      return (pk, i);
    }
  }
  panic!("Could not generate signer key");
}

#[allow(dead_code)]
pub fn clone_keypair(keypair: &Keypair) -> Keypair {
  Keypair::from_base58_string(&keypair.to_base58_string())
}
