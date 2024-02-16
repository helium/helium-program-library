use std::{collections::HashMap, rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster};
use anyhow::{anyhow, Context, Result};
use clap::Parser;
use helium_entity_manager::{
  accounts::TempStandardizeEntity, MakerV0, MetadataArgs, TempStandardizeEntityArgs,
};
use hpl_utils::construct_and_send_txs;
use serde::{Deserialize, Serialize};
use serde_json::json;
use solana_client::tpu_client::{TpuClient, TpuClientConfig};
use solana_sdk::{
  commitment_config::CommitmentConfig,
  instruction::{AccountMeta, Instruction},
  pubkey::Pubkey,
  signature::read_keypair_file,
  signer::Signer,
};

const BUBBLEGUM_PROGRAM_ID: &str = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
const TM_PROGRAM_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const LOG_WRAPPER_PROGRAM_ID: &str = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
const COMPRESSION_PROGRAM_ID: &str = "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK";

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  /// Solana paper wallet that will be the holder of the hotspot
  #[arg(short, long)]
  pub keypair: String,
  /// RPC url
  #[arg(short, long)]
  pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
  jsonrpc: String,
  method: String,
  params: serde_json::Value,
  id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse<T> {
  jsonrpc: String,
  result: Option<T>,
  error: Option<JsonRpcError>,
  id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AssetsResponse {
  items: Vec<AssetResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProofResponse {
  root: String,
  proof: Vec<String>,
  tree_id: String,
  node_index: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct AssetResponse {
  id: String,
  content: Content,
  grouping: Vec<Grouping>,
  creators: Vec<Creator>,
  ownership: Ownership,
  compression: Compression,
}

#[derive(Debug, Serialize, Deserialize)]
struct Compression {
  leaf_id: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Ownership {
  owner: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Content {
  json_uri: String,
  metadata: Metadata,
}

#[derive(Debug, Serialize, Deserialize)]
struct Metadata {
  name: String,
  symbol: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Creator {
  pub address: String,
  pub verified: bool,
  pub share: u8,
}

#[derive(Debug, Serialize, Deserialize)]
struct Grouping {
  group_key: String,
  group_value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcError {
  code: i32,
  message: String,
}

#[macro_export]
macro_rules! json_err {
  ( $object:expr, $key:expr ) => {
    format!("Info: ${:?}\n\nKey not found: {}", $object, $key)
  };
}

#[macro_export]
macro_rules! parse_err {
  ($object:expr) => {
    format!("Info: ${:?}\n\nCould not parse", $object)
  };
  ( $object:expr, $subject:expr ) => {
    format!("Info: ${:?}\n\nCould not parse: {}", $object, $subject)
  };
}

#[tokio::main]
async fn main() -> Result<()> {
  let args = Args::parse();

  let bubblegum_program_id = Pubkey::from_str(BUBBLEGUM_PROGRAM_ID).unwrap();
  let tm_program_id = Pubkey::from_str(TM_PROGRAM_ID)?;
  let log_wrapper_program_id = Pubkey::from_str(LOG_WRAPPER_PROGRAM_ID)?;
  let compression_program_id = Pubkey::from_str(COMPRESSION_PROGRAM_ID)?;
  let kp = Rc::new(read_keypair_file(args.keypair).unwrap());
  let me = kp.pubkey();
  let wss_url = args
    .url
    .clone()
    .replace("https", "wss")
    .replace("http", "ws");
  let anchor_client = Client::new_with_options(
    Cluster::Custom(args.url.clone(), wss_url.clone()),
    kp.clone(),
    CommitmentConfig::confirmed(),
  );
  let helium_entity_program = anchor_client.program(helium_entity_manager::id())?;
  let tpu_client = TpuClient::new(
    helium_entity_program.rpc().into(),
    &wss_url,
    TpuClientConfig::default(),
  )
  .unwrap();
  let makers = helium_entity_program.accounts::<MakerV0>(vec![]).await?;
  let makers_by_collection: HashMap<_, _> = makers
    .iter()
    .map(|(k, maker)| (maker.collection, (k, maker)))
    .collect();
  let entity_creator = Pubkey::from_str("Fv5hf1Fg58htfC7YEXKNEfkpuogUUQDDTLgjGWxxv48H").unwrap();
  let dao = Pubkey::from_str("BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie").unwrap();
  let data_only_config = Pubkey::find_program_address(
    &["data_only_config".as_bytes(), dao.as_ref()],
    &helium_entity_program.id(),
  )
  .0;
  let data_only_collection = Pubkey::find_program_address(
    &["collection".as_bytes(), data_only_config.as_ref()],
    &helium_entity_program.id(),
  )
  .0;
  let mut counter = 1;
  let batch_size = 100; // 64 / 2; // Max buffer size on our trees.
  let req_client = reqwest::Client::new();
  loop {
    // get all nfts owned by user from the das
    let get_asset_response = req_client
      .post(helium_entity_program.rpc().url())
      .header("Cache-Control", "no-cache")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .json(&JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "searchAssets".to_string(),
        params: json!({
            "creatorAddress": entity_creator.to_string(),
            "creatorVerified": true,
            "page": counter,
            "limit": batch_size,
        }),
        id: "rpd-op-123".to_string(),
      })
      .send()
      .await
      .map_err(|e| anyhow!("Failed to get asset: {e}"))?
      .json::<JsonRpcResponse<AssetsResponse>>()
      .await
      .map_err(|e| anyhow!("Failed to parse asset response: {e}"))?;
    if let Some(err) = get_asset_response.error {
      return Err(anyhow!("Json error {}", err.message));
    }
    let assets = get_asset_response.result.unwrap().items;
    if assets.len() == 0 {
      println!("Done");
      break;
    }
    println!("Batching {} assets", assets.len());
    let ids: Vec<String> = assets.iter().map(|a| a.id.clone()).collect();
    // get all nfts owned by user from the das
    let get_proofs_response = req_client
      .post(helium_entity_program.rpc().url())
      .header("Cache-Control", "no-cache")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .json(&JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "getAssetProofBatch".to_string(),
        params: json!({
            "ids": ids
        }),
        id: "rpd-op-123".to_string(),
      })
      .send()
      .await
      .map_err(|e| anyhow!("Failed to get proof: {e}"))?
      .json::<JsonRpcResponse<HashMap<String, ProofResponse>>>()
      .await
      .map_err(|e| anyhow!("Failed to parse proof response: {e}"))?;
    if let Some(err) = get_proofs_response.error {
      return Err(anyhow!("Json error {}", err.message));
    }
    let proof_result = get_proofs_response.result.unwrap();
    let proofs: HashMap<String, ProofResponse> = proof_result;

    let instructions: Vec<Instruction> = assets
      .iter()
      .map(|asset| (asset, proofs.get(&asset.id).unwrap()))
      .filter(|(asset, _)| !asset.content.json_uri.contains("/v2/") || asset.creators.len() == 1)
      .map(|(asset, proof)| {
        let key_to_asset = key_to_asset_for_asset(asset, dao)?;
        let root = Pubkey::from_str(&proof.root)?;
        let merkle_tree = Pubkey::from_str(&proof.tree_id)?;
        let maker_opt =
          makers_by_collection.get(&Pubkey::from_str(&asset.grouping[0].group_value).unwrap());
        let collection = maker_opt
          .map(|m| m.1.collection)
          .unwrap_or_else(|| data_only_collection);
        let mut instructions = helium_entity_program
          .request()
          .args(helium_entity_manager::instruction::TempStandardizeEntity {
            args: TempStandardizeEntityArgs {
              root: root.to_bytes(),
              index: asset.compression.leaf_id,
              current_metadata: MetadataArgs {
                name: asset.content.metadata.name.clone(),
                symbol: asset.content.metadata.symbol.clone(),
                uri: asset.content.json_uri.clone(),
                creators: asset
                  .creators
                  .iter()
                  .map(|c| helium_entity_manager::Creator {
                    address: Pubkey::from_str(&c.address).unwrap(),
                    verified: c.verified,
                    share: c.share,
                  })
                  .collect(),
              },
            },
          })
          .accounts(TempStandardizeEntity {
            key_to_asset,
            merkle_tree,
            maker: maker_opt.map(|m| *m.0),
            collection,
            data_only_config,
            tree_authority: Pubkey::find_program_address(
              &[merkle_tree.as_ref()],
              &bubblegum_program_id,
            )
            .0,
            authority: me,
            collection_metadata: Pubkey::find_program_address(
              &[
                "metadata".as_bytes(),
                tm_program_id.as_ref(),
                collection.as_ref(),
              ],
              &tm_program_id,
            )
            .0,
            leaf_owner: Pubkey::from_str(&asset.ownership.owner).unwrap(),
            payer: me,
            log_wrapper: log_wrapper_program_id,
            compression_program: compression_program_id,
            bubblegum_program: bubblegum_program_id,
            token_metadata_program: tm_program_id,
            system_program: solana_sdk::system_program::id(),
          })
          .instructions()?;
        instructions[0]
          .accounts
          .extend(proof.proof.iter().take(3).map(|p| AccountMeta {
            pubkey: Pubkey::from_str(p).unwrap(),
            is_signer: false,
            is_writable: false,
          }));
        Ok(instructions)
      })
      .collect::<Result<Vec<Vec<Instruction>>>>()?
      .into_iter()
      .flatten()
      .collect();

    if let Err(r) = construct_and_send_txs(
      &helium_entity_program.rpc(),
      &tpu_client,
      instructions,
      &kp,
      false,
    ) {
      println!("Failed to send txs: {:?}", r);
    };
    counter += 1;
  }

  Ok(())
}

fn key_to_asset_for_asset(asset: &AssetResponse, dao: Pubkey) -> Result<Pubkey, anyhow::Error> {
  let creator = asset.creators.get(1);
  match creator {
    Some(v) => Pubkey::from_str(&v.address).map_err(anyhow::Error::from),
    _ => {
      let json_uri = asset.content.json_uri.clone();
      let entity_key = json_uri
        .split("/")
        .collect::<Vec<_>>()
        .last()
        .context(parse_err!(json_uri))?
        .to_string();

      let symbol = asset.content.metadata.symbol.clone();

      let entity_key_bytes = if symbol == "IOT OPS" || symbol == "CARRIER" {
        entity_key.as_bytes().to_vec()
      } else {
        bs58::decode(entity_key)
          .into_vec()
          .map_err(anyhow::Error::from)?
      };

      Ok(
        Pubkey::find_program_address(
          &[
            "key_to_asset".as_bytes(),
            dao.as_ref(),
            &solana_sdk::hash::hash(&entity_key_bytes[..]).to_bytes(),
          ],
          &helium_entity_manager::id(),
        )
        .0,
      )
    }
  }
}
