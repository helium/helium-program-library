#[macro_use]
extern crate rocket;
use std::{env, str::FromStr};

use anchor_lang::{
  prelude::{borsh, Pubkey},
  AnchorDeserialize, AnchorSerialize,
};
use helium_crypto::{PublicKey, Verify};
use rocket::{
  http::Status,
  serde::{json::Json, Deserialize, Serialize},
};
use solana_sdk::{
  borsh0_10::try_from_slice_unchecked,
  bs58,
  compute_budget::{self, ComputeBudgetInstruction},
  instruction::CompiledInstruction,
  message::VersionedMessage,
  signature::{read_keypair_file, Signature},
  signer::{Signer, SignerError},
  transaction::VersionedTransaction,
};

#[derive(Serialize)]
#[serde(crate = "rocket::serde")]
struct HealthResponse {
  pub ok: bool,
}

#[get("/health")]
fn health() -> Json<HealthResponse> {
  Json(HealthResponse { ok: true })
}

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct VerifyRequest<'a> {
  // hex encoded solana transaction
  pub transaction: &'a str,
  // hex encoded signed message
  pub msg: &'a str,
  // hex encoded signature
  pub signature: &'a str,
}

#[derive(Serialize)]
#[serde(crate = "rocket::serde")]
struct VerifyResult {
  // hex encoded solana transaction
  pub transaction: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueEntityArgsV0 {
  pub entity_key: Vec<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueDataOnlyEntityArgsV0 {
  pub entity_key: Vec<u8>,
}

struct ExistingSigner {
  pub signature: Signature,
  pub pubkey: Pubkey,
}

impl Signer for ExistingSigner {
  fn try_pubkey(&self) -> Result<Pubkey, SignerError> {
    Ok(self.pubkey)
  }

  fn try_sign_message(&self, _message: &[u8]) -> Result<Signature, SignerError> {
    Ok(self.signature)
  }

  fn is_interactive(&self) -> bool {
    false
  }
}

#[post("/verify", format = "application/json", data = "<verify>")]
async fn verify(verify: Json<VerifyRequest<'_>>) -> Result<Json<VerifyResult>, Status> {
  let solana_txn_hex = hex::decode(verify.transaction).map_err(|e| {
    error!("failed to decode transaction: {:?}", e);
    Status::BadRequest
  })?;
  let solana_txn: VersionedTransaction = bincode::deserialize(&solana_txn_hex).map_err(|e| {
    error!("failed to deserialize tx: {:?}", e);
    Status::BadRequest
  })?;

  // From here on every program id is a static account key, and there is one signature per
  // required signer, each for a static account key.
  solana_txn.sanitize(true).map_err(|e| {
    error!("invalid transaction: {:?}", e);
    Status::BadRequest
  })?;
  let account_keys = solana_txn.message.static_account_keys();
  let program_id = |ixn: &CompiledInstruction| account_keys[usize::from(ixn.program_id_index)];
  let compute_budget_ixn = |ixn: &CompiledInstruction| {
    (program_id(ixn) == compute_budget::id())
      .then(|| try_from_slice_unchecked::<ComputeBudgetInstruction>(&ixn.data).ok())
      .flatten()
  };

  // The verifier signs a compute unit limit and a compute unit price followed by the issue
  // instruction, and nothing else.
  let ixn = match solana_txn.message.instructions() {
    [limit, price, issue]
      if matches!(
        compute_budget_ixn(limit),
        Some(ComputeBudgetInstruction::SetComputeUnitLimit(_))
      ) && matches!(
        compute_budget_ixn(price),
        Some(ComputeBudgetInstruction::SetComputeUnitPrice(_))
      ) =>
    {
      issue
    }
    _ => {
      error!("Unexpected instructions");
      return Err(Status::BadRequest);
    }
  };

  let keypair = read_keypair_file(env::var("ANCHOR_WALLET").unwrap_or("keypair.json".to_string()))
    .map_err(|_| {
      error!("failed to read keypair");
      Status::InternalServerError
    })?;

  if !is_read_only_signer(&solana_txn.message, &keypair.pubkey()) {
    error!("Verifier is not a read-only signer");
    return Err(Status::BadRequest);
  }

  // Verify it's entity manager instruction
  if program_id(ixn) != Pubkey::from_str("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8").unwrap() {
    error!("Pubkey mismatch");
    return Err(Status::BadRequest);
  }

  // Verify it's issue_entity or issue_data_only_entity
  let issue_sighash = sighash("global", "issue_entity_v0");
  let issue_do_sighash = sighash("global", "issue_data_only_entity_v0");
  let discriminator = ixn.data.get(..8);
  if discriminator != Some(&issue_sighash[..]) && discriminator != Some(&issue_do_sighash[..]) {
    error!("Sighash mismatch");
    return Err(Status::BadRequest);
  }

  let pubkey: PublicKey = if discriminator == Some(&issue_sighash[..]) {
    let issue_entity = IssueEntityArgsV0::try_from_slice(&ixn.data[8..]).map_err(|e| {
      error!("Failed to decode instruction: {:?}", e);
      Status::BadRequest
    })?;
    let keystr = bs58::encode(&issue_entity.entity_key).into_string();
    info!("key: {:?}", keystr);
    PublicKey::from_str(&keystr).map_err(|e| {
      error!("failed to parse pubkey: {:?}", e);
      Status::BadRequest
    })?
  } else {
    let issue_entity = IssueDataOnlyEntityArgsV0::try_from_slice(&ixn.data[8..]).map_err(|e| {
      error!("Failed to decode instruction: {:?}", e);
      Status::BadRequest
    })?;
    let keystr = bs58::encode(&issue_entity.entity_key).into_string();
    info!("key: {:?}", keystr);
    PublicKey::from_str(&keystr).map_err(|e| {
      error!("failed to parse pubkey: {:?}", e);
      Status::BadRequest
    })?
  };
  info!("pubkey: {:?}", pubkey.to_string());

  // Verify the ecc signature against the message
  let msg = hex::decode(verify.msg).map_err(|_| Status::BadRequest)?;
  let signature = hex::decode(verify.signature).map_err(|_| Status::BadRequest)?;
  pubkey.verify(&msg, &signature).map_err(|e| {
    error!("failed to verify signature: {:?}", e);
    Status::BadRequest
  })?;

  // Sign the solana transaction
  let existing_signers_count = solana_txn.signatures.len() - 1;
  let existing_signers: Vec<ExistingSigner> = (0..existing_signers_count)
    .map(|s| ExistingSigner {
      signature: solana_txn.signatures[s],
      pubkey: account_keys[s],
    })
    .collect();
  let mut signers: Vec<&dyn Signer> = existing_signers.iter().map(|s| s as &dyn Signer).collect();
  signers.push(&keypair);
  let new_tx = VersionedTransaction::try_new(solana_txn.message, &signers).map_err(|e| {
    error!("failed to sign transaction: {:?}", e);
    Status::BadRequest
  })?;

  let serialized_txn = hex::encode(&bincode::serialize(&new_tx).map_err(|e| {
    error!("failed to serialize transaction: {:?}", e);
    Status::BadRequest
  })?);

  Ok(Json(VerifyResult {
    transaction: serialized_txn,
  }))
}

/// Read-only signers follow the writable signers in the account keys, and the runtime requires
/// the fee payer to be writable, so a read-only signer is never the fee payer and no instruction
/// can debit it.
fn is_read_only_signer(message: &VersionedMessage, key: &Pubkey) -> bool {
  let header = message.header();
  let num_signers = usize::from(header.num_required_signatures);
  let read_only_signers =
    num_signers.saturating_sub(usize::from(header.num_readonly_signed_accounts))..num_signers;
  matches!(
    message.static_account_keys().iter().position(|k| k == key),
    Some(index) if read_only_signers.contains(&index)
  )
}

#[launch]
fn rocket() -> _ {
  rocket::build().mount("/", routes![health, verify])
}

pub fn sighash(namespace: &str, name: &str) -> [u8; 8] {
  let preimage = format!("{}:{}", namespace, name);

  let mut sighash = [0u8; 8];
  sighash
    .copy_from_slice(&anchor_lang::solana_program::hash::hash(preimage.as_bytes()).to_bytes()[..8]);
  sighash
}

#[cfg(test)]
mod tests {
  use std::sync::Once;

  use helium_crypto::{KeyTag, Keypair as EccKeypair, Sign};
  use rocket::{http::ContentType, local::blocking::Client};
  use solana_sdk::{
    hash::Hash,
    instruction::{AccountMeta, Instruction},
    message::{
      v0::{self, MessageAddressTableLookup},
      Message, MessageHeader,
    },
    signature::{keypair_from_seed, write_keypair_file, Keypair},
  };

  use super::*;

  static WRITE_VERIFIER_KEYPAIR: Once = Once::new();

  // The handler reads its keypair from ANCHOR_WALLET, so every test writes the same one there.
  fn verifier() -> Keypair {
    let keypair = keypair_from_seed(&[7; 32]).expect("derive verifier keypair");
    WRITE_VERIFIER_KEYPAIR.call_once(|| {
      let path = env::temp_dir().join(format!("ecc-sig-verifier-test-{}.json", std::process::id()));
      write_keypair_file(&keypair, &path).expect("write verifier keypair");
      env::set_var("ANCHOR_WALLET", &path);
    });
    keypair
  }

  fn gateway(seed: u8) -> EccKeypair {
    EccKeypair::generate_from_entropy(KeyTag::default(), &[seed; 32])
      .expect("derive gateway keypair")
  }

  // The gateway whose signature every request carries.
  fn signing_gateway() -> EccKeypair {
    gateway(9)
  }

  fn issue_data(gateway: &EccKeypair) -> Vec<u8> {
    let entity_key = bs58::decode(gateway.public_key().to_string())
      .into_vec()
      .expect("decode gateway key");
    let mut data = sighash("global", "issue_data_only_entity_v0").to_vec();
    data.extend(
      IssueDataOnlyEntityArgsV0 { entity_key }
        .try_to_vec()
        .expect("serialize issue args"),
    );
    data
  }

  fn hem_ix(payer: &Pubkey, data: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
      Pubkey::from_str("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8").expect("parse program id"),
      data,
      vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(verifier().pubkey(), true),
      ],
    )
  }

  fn issue_ix(payer: &Pubkey, gateway: &EccKeypair) -> Instruction {
    hem_ix(payer, &issue_data(gateway))
  }

  fn compute_limit() -> Instruction {
    ComputeBudgetInstruction::set_compute_unit_limit(200_000)
  }

  fn compute_price() -> Instruction {
    ComputeBudgetInstruction::set_compute_unit_price(1)
  }

  fn transaction(fee_payer: &Pubkey, instructions: &[Instruction]) -> VersionedTransaction {
    let message = Message::new(instructions, Some(fee_payer));
    VersionedTransaction {
      signatures: vec![Signature::default(); usize::from(message.header.num_required_signatures)],
      message: VersionedMessage::Legacy(message),
    }
  }

  // A request carrying a valid signature from `signing_gateway`.
  fn request(transaction: &VersionedTransaction) -> String {
    let msg = b"add gateway";
    format!(
      r#"{{"transaction":"{}","msg":"{}","signature":"{}"}}"#,
      hex::encode(bincode::serialize(transaction).expect("serialize transaction")),
      hex::encode(msg),
      hex::encode(signing_gateway().sign(msg).expect("sign msg")),
    )
  }

  // The shape clients send, so only the fee payer and the `payer` account vary.
  fn issue_request(fee_payer: &Pubkey, payer: &Pubkey) -> String {
    request(&transaction(
      fee_payer,
      &[
        compute_limit(),
        compute_price(),
        issue_ix(payer, &signing_gateway()),
      ],
    ))
  }

  fn post(body: String) -> Status {
    Client::tracked(rocket())
      .expect("build client")
      .post("/verify")
      .header(ContentType::JSON)
      .body(body)
      .dispatch()
      .status()
  }

  #[test]
  fn signs_as_a_read_only_signer() {
    let owner = Pubkey::new_unique();
    assert_eq!(post(issue_request(&owner, &owner)), Status::Ok);
  }

  #[test]
  fn refuses_to_be_the_fee_payer() {
    let verifier = verifier().pubkey();
    assert_eq!(
      post(issue_request(&verifier, &verifier)),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_to_be_a_writable_signer() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      post(issue_request(&owner, &verifier().pubkey())),
      Status::BadRequest
    );
  }

  fn shape_status(instructions: &[Instruction]) -> Status {
    post(request(&transaction(&Pubkey::new_unique(), instructions)))
  }

  #[test]
  fn refuses_another_instruction_in_place_of_the_compute_unit_limit() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[
        issue_ix(&owner, &gateway(10)),
        compute_price(),
        issue_ix(&owner, &signing_gateway()),
      ]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_another_instruction_in_place_of_the_compute_unit_price() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[
        compute_limit(),
        issue_ix(&owner, &gateway(10)),
        issue_ix(&owner, &signing_gateway()),
      ]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_a_heap_frame_request_in_place_of_the_compute_unit_limit() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[
        ComputeBudgetInstruction::request_heap_frame(32 * 1024),
        compute_price(),
        issue_ix(&owner, &signing_gateway()),
      ]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_compute_unit_limit_data_sent_to_another_program() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[
        Instruction::new_with_bytes(Pubkey::new_unique(), &compute_limit().data, vec![]),
        compute_price(),
        issue_ix(&owner, &signing_gateway()),
      ]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_a_second_compute_unit_limit_in_place_of_the_price() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[
        compute_limit(),
        compute_limit(),
        issue_ix(&owner, &signing_gateway()),
      ]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_a_program_id_index_past_the_account_keys() {
    let owner = Pubkey::new_unique();
    let mut transaction = transaction(
      &owner,
      &[
        compute_limit(),
        compute_price(),
        issue_ix(&owner, &signing_gateway()),
      ],
    );
    let VersionedMessage::Legacy(message) = &mut transaction.message else {
      unreachable!("transaction() builds a legacy message")
    };
    message.instructions[2].program_id_index = 200;
    assert_eq!(post(request(&transaction)), Status::BadRequest);
  }

  #[test]
  fn refuses_a_program_id_loaded_from_a_lookup_table() {
    let owner = Pubkey::new_unique();
    let message = v0::Message {
      header: MessageHeader {
        num_required_signatures: 2,
        num_readonly_signed_accounts: 1,
        num_readonly_unsigned_accounts: 1,
      },
      account_keys: vec![owner, verifier().pubkey(), compute_budget::id()],
      recent_blockhash: Hash::default(),
      instructions: vec![
        CompiledInstruction::new_from_raw_parts(2, compute_limit().data, vec![]),
        CompiledInstruction::new_from_raw_parts(2, compute_price().data, vec![]),
        // Index 3 is the first key the lookup table loads.
        CompiledInstruction::new_from_raw_parts(3, issue_data(&signing_gateway()), vec![0, 1]),
      ],
      address_table_lookups: vec![MessageAddressTableLookup {
        account_key: Pubkey::new_unique(),
        writable_indexes: vec![],
        readonly_indexes: vec![0],
      }],
    };
    let transaction = VersionedTransaction {
      signatures: vec![Signature::default(); 2],
      message: VersionedMessage::V0(message),
    };
    assert_eq!(post(request(&transaction)), Status::BadRequest);
  }

  #[test]
  fn refuses_an_instruction_after_the_issue() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[
        compute_limit(),
        compute_price(),
        issue_ix(&owner, &signing_gateway()),
        issue_ix(&owner, &gateway(10)),
      ]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_a_missing_compute_budget_instruction() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[compute_price(), issue_ix(&owner, &signing_gateway())]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_issue_data_shorter_than_a_discriminator() {
    let owner = Pubkey::new_unique();
    assert_eq!(
      shape_status(&[compute_limit(), compute_price(), hem_ix(&owner, &[1, 2, 3])]),
      Status::BadRequest
    );
  }

  #[test]
  fn refuses_a_transaction_missing_its_signature_slots() {
    let owner = Pubkey::new_unique();
    let mut unsigned = transaction(
      &owner,
      &[
        compute_limit(),
        compute_price(),
        issue_ix(&owner, &signing_gateway()),
      ],
    );
    unsigned.signatures.clear();
    assert_eq!(post(request(&unsigned)), Status::BadRequest);
  }

  fn message_with_read_only_account(key: &Pubkey) -> VersionedMessage {
    VersionedMessage::Legacy(Message::new(
      &[Instruction::new_with_bytes(
        Pubkey::new_unique(),
        &[],
        vec![AccountMeta::new_readonly(*key, false)],
      )],
      Some(&Pubkey::new_unique()),
    ))
  }

  #[test]
  fn a_read_only_non_signer_is_not_a_read_only_signer() {
    let key = Pubkey::new_unique();
    assert!(!is_read_only_signer(
      &message_with_read_only_account(&key),
      &key
    ));
  }

  #[test]
  fn an_absent_key_is_not_a_read_only_signer() {
    let message = message_with_read_only_account(&Pubkey::new_unique());
    assert!(!is_read_only_signer(&message, &Pubkey::new_unique()));
  }
}
