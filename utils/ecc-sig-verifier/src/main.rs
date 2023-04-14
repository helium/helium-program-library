#[macro_use]
extern crate rocket;
use anchor_lang::prelude::borsh;
use anchor_lang::{prelude::Pubkey, AnchorDeserialize, AnchorSerialize};
use helium_crypto::{PublicKey, Verify};
use rocket::{
  http::Status,
  serde::{json::Json, Deserialize, Serialize},
};
use solana_sdk::{bs58, signature::read_keypair_file, transaction::Transaction};
use std::env;
use std::str::FromStr;

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

#[derive(Deserialize, Serialize, Default)]
struct TransactionResponse {
  pub count: u32,
  pub transactions: Vec<Vec<u8>>,
}

#[post("/verify", format = "application/json", data = "<verify>")]
async fn verify<'a>(verify: Json<VerifyRequest<'a>>) -> Result<Json<VerifyResult>, Status> {
  let solana_txn_hex = hex::decode(&verify.transaction).map_err(|e| {
    error!("failed to decode transaction: {:?}", e);
    Status::BadRequest
  })?;
  let mut solana_txn: Transaction = bincode::deserialize(&solana_txn_hex).map_err(|e| {
    error!("failed to deserialize tx: {:?}", e);
    Status::BadRequest
  })?;

  let account_keys = &solana_txn.message.account_keys;
  if solana_txn.message.instructions.len() != 2 {
    error!("Invalid instruction count");
    return Err(Status::BadRequest);
  }

  // First ix is always a compute budget ix
  let compute_ixn = &solana_txn.message.instructions[0];
  let compute_program_id = account_keys[compute_ixn.program_id_index as usize];
  if compute_program_id != Pubkey::from_str("ComputeBudget111111111111111111111111111111").unwrap()
  {
    error!("First instruction is not compute budget");
    return Err(Status::BadRequest);
  }

  // Verify it's entity manager instruction
  let ixn = &solana_txn.message.instructions[1];
  let program_id = account_keys[ixn.program_id_index as usize];
  if program_id != Pubkey::from_str("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8").unwrap() {
    error!("Pubkey mismatch");
    return Err(Status::BadRequest);
  }

  // Verify it's issue entity
  let sighash = sighash("global", "issue_entity_v0");
  if sighash != ixn.data[0..8] {
    error!("Sighash mismatch");
    return Err(Status::BadRequest);
  }

  let issue_entity = IssueEntityArgsV0::try_from_slice(&ixn.data[8..]).map_err(|e| {
    error!("Failed to decode instruction: {:?}", e);
    Status::BadRequest
  })?;
  let keystr = bs58::encode(&issue_entity.entity_key).into_string();
  info!("key: {:?}", keystr);
  let pubkey = PublicKey::from_str(&keystr).unwrap();

  // Verify the ecc signature against the message
  let msg = hex::decode(&verify.msg).map_err(|_| Status::BadRequest)?;
  let signature = hex::decode(&verify.signature).map_err(|_| Status::BadRequest)?;
  pubkey.verify(&msg, &signature).map_err(|e| {
    error!("failed to verify signature: {:?}", e);
    Status::BadRequest
  })?;

  let migration_url = env::var("MIGRATION_SERVICE_URL").expect("MIGRATION_SERVICE_URL must be set");
  // Make sure the hotspot doesn't need to be migrated
  let url = format!(
    "{}/migrate/hotspot/{}?limit=1&offset=0",
    migration_url, keystr
  );
  println!("{}", url);
  let response = reqwest::get(url.as_str())
    .await
    .map_err(|e| {
      error!("failed to fetch from migration service: {:?}", e);
      Status::BadRequest
    })?
    .json::<TransactionResponse>()
    .await
    .map_err(|e| {
      error!("failed to deserialize json: {:?}", e);
      Status::BadRequest
    })?;

  if response.transactions.len() > 0 {
    error!(
      "Cannot onboard hotspot with key: {:?}. It has not been migrated yet.",
      keystr
    );
    return Err(Status::BadRequest);
  }

  // Sign the solana transaction
  let keypair = read_keypair_file(env::var("ANCHOR_WALLET").unwrap_or("keypair.json".to_string()))
    .map_err(|_| {
      error!("failed to read keypair");
      Status::InternalServerError
    })?;
  solana_txn
    .try_partial_sign(&[&keypair], solana_txn.message.recent_blockhash)
    .map_err(|e| {
      error!("failed to sign transaction: {:?}", e);
      Status::BadRequest
    })?;

  let serialized_txn = hex::encode(&bincode::serialize(&solana_txn).map_err(|e| {
    error!("failed to serialize transaction: {:?}", e);
    Status::BadRequest
  })?);

  Ok(Json(VerifyResult {
    transaction: serialized_txn,
  }))
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
