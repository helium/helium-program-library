use anchor_client::{Client, Cluster, Program};
use anchor_lang::AccountDeserialize;
use anyhow::{anyhow, Context, Result};
use bs58;
use chrono::{Duration, Utc};
use clap::Parser;
use datafusion::arrow::array::StringArray;
use deltalake::arrow::array::Array;
use deltalake::{datafusion::prelude::SessionContext, DeltaTableBuilder};
use helium_entity_manager::{accounts::SetEntityActiveV0, SetEntityActiveArgsV0};
use helium_entity_manager::{IotHotspotInfoV0, MobileHotspotInfoV0};
use hpl_utils::{dao::SubDao, send_and_confirm_messages_with_spinner};
use indicatif::{ProgressBar, ProgressStyle};
use s3::{bucket::Bucket, creds::Credentials, region::Region};
use serde::{Deserialize, Serialize};
use solana_client::tpu_client::{TpuClient, TpuClientConfig};
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Keypair;
use solana_sdk::transaction::Transaction;
use solana_sdk::{instruction::Instruction, pubkey::Pubkey, signature::read_keypair_file};
use std::env;
use std::rc::Rc;
use std::str::FromStr;
use std::{
  collections::{HashMap, HashSet},
  sync::Arc,
};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  /// Bucket name for the store. Required
  #[clap(long)]
  pub aws_bucket: Option<String>,
  #[clap(long)]
  pub aws_table: Option<String>,
  /// Optional api endpoint for the bucket. Default none
  #[clap(long)]
  pub aws_endpoint: Option<String>,
  /// Optional region for the endpoint
  #[clap(long)]
  pub aws_region: Option<String>,

  /// Should only be used for local testing, set as environment variables in deployment
  #[clap(long)]
  pub access_key_id: Option<String>,
  #[clap(long)]
  pub secret_access_key: Option<String>,

  /// Solana paper wallet that will be the holder of the hotspot
  #[arg(short, long)]
  keypair: Option<String>,
  /// RPC url
  #[arg(short, long)]
  url: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ActiveCheckpoint {
  set: HashSet<String>,
}

fn load_arg_from_cli_or_env(cli_opt: Option<String>, env_name: &str) -> String {
  let arg = if let Some(cli_arg) = cli_opt {
    cli_arg
  } else {
    env::var(env_name)
      .context(format!(
        "Must supply {} as env var or cli argument",
        env_name
      ))
      .unwrap()
  };
  arg
}

#[tokio::main]
async fn main() -> Result<()> {
  std::env::set_var("RUST_LOG", "s3=debug");
  use clap::Parser;
  let args = Args::parse();

  let kp_path = load_arg_from_cli_or_env(args.keypair, "ANCHOR_WALLET");
  let rpc_url = load_arg_from_cli_or_env(args.url, "SOLANA_URL");
  let s3_bucket = load_arg_from_cli_or_env(args.aws_bucket, "AWS_BUCKET");
  let s3_table = load_arg_from_cli_or_env(args.aws_table, "AWS_TABLE");
  let s3_region = load_arg_from_cli_or_env(args.aws_region, "AWS_REGION");
  let access_key_id = load_arg_from_cli_or_env(args.access_key_id, "AWS_ACCESS_KEY_ID");
  let secret_access_key = load_arg_from_cli_or_env(args.secret_access_key, "AWS_SECRET_ACCESS_KEY");

  // Create anchor program client
  let kp = Rc::new(read_keypair_file(kp_path).unwrap());
  let wss_url = rpc_url
    .clone()
    .replace("https", "wss")
    .replace("http", "ws");
  let anchor_client = Client::new_with_options(
    Cluster::Custom(rpc_url.clone(), wss_url.clone()),
    kp.clone(),
    CommitmentConfig::confirmed(),
  );
  let helium_entity_program = anchor_client.program(helium_entity_manager::id());
  let tpu_client = TpuClient::new(
    helium_entity_program.rpc().into(),
    &wss_url,
    TpuClientConfig::default(),
  )
  .unwrap();

  // set up delta-rs connection
  let table_path = format!("s3://{}/{}", s3_bucket, s3_table);
  let mut s3_config = HashMap::from([("aws_default_region".to_string(), s3_region.clone())]);
  s3_config.insert("bucket_name".to_string(), s3_bucket);
  s3_config.insert("aws_secret_access_key".to_string(), secret_access_key);
  s3_config.insert("allow_http".to_string(), "true".to_string());
  s3_config.insert("aws_access_key_id".to_string(), access_key_id);
  if let Some(endpoint) = args.aws_endpoint {
    s3_config.insert("aws_endpoint".to_string(), endpoint);
  }
  let mut delta_table = DeltaTableBuilder::from_uri(table_path.clone())
    .with_storage_options(s3_config.clone())
    .build()?;
  delta_table.load().await.expect("Failed to load");
  let session = SessionContext::new();
  session.register_table("delta_table", Arc::new(delta_table))?;

  // query the delta-rs table to get a list of active and known inactive hotspots
  println!("Querying records");
  let current_time = Utc::now();
  let thirty_days_ago = current_time - Duration::days(180);
  let query = format!(
    "SELECT * FROM delta_table WHERE most_recent_ts > {}",
    thirty_days_ago.timestamp(),
  );
  let record_batches = session.sql(query.as_str()).await?.collect().await?;
  println!("Record batches: {:?}", record_batches.len());

  // parse the results into a hashset of active pubkeys
  let mut active_pub_keys: HashSet<String> = HashSet::new();
  let mut count = 0;
  println!("Processing records");
  for record_batch in record_batches {
    let pub_keys = record_batch
      .column_by_name("hotspot_key")
      .context("No hotspot_key column array found")?
      .as_any()
      .downcast_ref::<StringArray>()
      .context("Result is not a string array")?;

    count += pub_keys.len();
    for pk in pub_keys {
      let pub_key = pk.unwrap_or("").clone().to_string();
      active_pub_keys.insert(pub_key);
    }
  }

  println!("Records processed: {:?}", count);
  println!("Active pub keys: {:?}", active_pub_keys.len());

  // download last checkpoint file from s3
  println!("Loading last save files from s3");
  let last_active_pub_keys: HashSet<String> =
    load_checkpoint(s3_config.clone(), "active_save.json")
      .await
      .unwrap_or(HashSet::new());
  let mut last_inactive_pub_keys: HashSet<String> =
    load_checkpoint(s3_config.clone(), "inactive_save.json")
      .await
      .unwrap_or(HashSet::new());

  println!("Last active pub keys: {:?}", last_active_pub_keys.len());
  println!("Last inactive pub keys: {:?}", last_inactive_pub_keys.len());

  // parse and find the diff
  println!("Finding new diffs");
  let mark_active_diff: Vec<String> = active_pub_keys
    .difference(&last_active_pub_keys)
    .cloned()
    .collect();
  let mark_inactive_diff: Vec<String> = last_active_pub_keys
    .difference(&active_pub_keys)
    .cloned()
    .collect();

  println!("Hotspots to mark active: {:?}", mark_active_diff.len());
  println!("Hotspots to mark inactive: {:?}", mark_inactive_diff.len());

  // construct the transactions for the diffs
  println!("Constructing instructions");
  let (mark_active_iot_ixs, mark_active_mobile_ixs) =
    construct_set_active_ixs(&helium_entity_program, &mark_active_diff, true)?;
  let (mark_inactive_iot_ixs, mark_inactive_mobile_ixs) =
    construct_set_active_ixs(&helium_entity_program, &mark_inactive_diff, false)?;

  // send transactions
  println!("Sending mark active iot transactions");
  construct_and_send_txs(
    &helium_entity_program,
    &tpu_client,
    mark_active_iot_ixs,
    &kp,
  )?;
  println!("Sending mark active mobile transactions");
  construct_and_send_txs(
    &helium_entity_program,
    &tpu_client,
    mark_active_mobile_ixs,
    &kp,
  )?;
  println!("Sending mark inactive iot transactions");
  construct_and_send_txs(
    &helium_entity_program,
    &tpu_client,
    mark_inactive_iot_ixs,
    &kp,
  )?;
  println!("Sending mark inactive mobile transactions");
  construct_and_send_txs(
    &helium_entity_program,
    &tpu_client,
    mark_inactive_mobile_ixs,
    &kp,
  )?;

  // write to new checkpoint file and upload to s3
  println!("Uploading new save files to s3");
  last_inactive_pub_keys.extend(mark_inactive_diff.iter().cloned());
  save_checkpoint(active_pub_keys, s3_config.clone(), "active_save.json").await?;
  save_checkpoint(
    last_inactive_pub_keys,
    s3_config.clone(),
    "inactive_save.json",
  )
  .await?;

  Ok(())
}

fn construct_and_send_txs(
  helium_entity_program: &Program,
  tpu_client: &TpuClient,
  ixs: Vec<Instruction>,
  payer: &Keypair,
) -> Result<()> {
  // send transactions in batches so blockhash doesn't expire
  let transaction_batch_size = 100;
  let ixs_per_tx = 28;
  let mut tx_count = 0;
  for i in (0..ixs.len()).step_by(transaction_batch_size * ixs_per_tx) {
    let tx_start = i;
    let tx_end = (i + transaction_batch_size * ixs_per_tx).min(ixs.len());
    let blockhash = helium_entity_program.rpc().get_latest_blockhash()?;
    let mut txs = Vec::new();
    for j in (tx_start..tx_end).step_by(ixs_per_tx) {
      let ix_start = j;
      let ix_end = (j + ixs_per_tx).min(ixs.len());
      let ixs_to_send = &ixs[ix_start..ix_end];
      let mut tx = Transaction::new_with_payer(ixs_to_send, Some(&helium_entity_program.payer()));
      tx.try_sign(&[payer], blockhash)
        .map_err(|e| anyhow!("Error while signing tx: {e}"))?;
      txs.push(tx);
    }
    tx_count += txs.len();

    let serialized_txs = txs
      .iter()
      .map(|tx| bincode::serialize(&tx.clone()).map_err(|e| anyhow!("Failed to serialize tx: {e}")))
      .collect::<Result<Vec<_>, anyhow::Error>>()
      .context("Failed to serialize txs")?;

    send_and_confirm_messages_with_spinner(
      helium_entity_program.rpc().into(),
      &tpu_client,
      &serialized_txs,
    )
    .context("Failed sending transactions")?;
  }
  println!("ix_count: {}", ixs.len());
  println!("tx_count: {}", tx_count);

  Ok(())
}

struct InfoWithEntityKey {
  info_key: Pubkey,
  entity_key: String,
}
fn construct_set_active_ixs(
  helium_entity_program: &Program,
  entity_keys: &Vec<String>,
  is_active: bool,
) -> Result<(Vec<Instruction>, Vec<Instruction>)> {
  // get PDAs
  let iot_sd = SubDao::Iot.key();
  let mobile_sd = SubDao::Mobile.key();
  let iot_rec = SubDao::Iot.rewardable_entity_config_key();
  let mobile_rec = SubDao::Mobile.rewardable_entity_config_key();

  let mark_iot_infos = entity_keys
    .iter()
    .map(|entity_key| {
      SubDao::Iot.info_key(
        &bs58::decode(entity_key.clone())
          .into_vec()
          .context(format!("Failed to decode entity key, {}", entity_key))?,
      )
    })
    .collect::<Result<Vec<Pubkey>>>()
    .context("Failed to construct iot infos")?;

  let mark_mobile_infos = entity_keys
    .iter()
    .map(|entity_key| {
      SubDao::Mobile.info_key(
        &bs58::decode(entity_key.clone())
          .into_vec()
          .context(format!("Failed to decode entity key, {}", entity_key))?,
      )
    })
    .collect::<Result<Vec<Pubkey>>>()
    .context("Failed to construct mobile infos")?;

  // fetch infos
  let mut valid_iot_infos = Vec::new();
  let mut valid_mobile_infos = Vec::new();
  let step = 100;
  let progress_bar = ProgressBar::new(entity_keys.len().try_into().unwrap());
  progress_bar.set_style(
    ProgressStyle::with_template("[{elapsed_precise}] {bar:40.cyan/blue} {pos:>7}/{len:7} {msg}")
      .unwrap()
      .progress_chars("##-"),
  );
  progress_bar.set_message("Fetching accounts...");

  for i in (0..entity_keys.len()).step_by(step) {
    progress_bar.set_position(i.try_into().unwrap());
    let start = i;
    let end = (i + step).min(entity_keys.len());
    let iot_infos = &mark_iot_infos[start..end];
    let mobile_infos = &mark_mobile_infos[start..end];

    let iot_info_accs = helium_entity_program
      .rpc()
      .get_multiple_accounts(iot_infos)?;
    let mobile_info_accs = helium_entity_program
      .rpc()
      .get_multiple_accounts(mobile_infos)?;

    for j in 0..iot_infos.len() {
      let iot_info_acc = &iot_info_accs[j];
      let mobile_info_acc = &mobile_info_accs[j];

      match iot_info_acc {
        Some(raw_info) => {
          let mut data = raw_info.data.as_slice();
          let parsed_info = IotHotspotInfoV0::try_deserialize(&mut data).context(format!(
            "Failed to deserialize iot info acc, {}",
            iot_infos[j].to_string()
          ))?;
          if parsed_info.is_active != is_active {
            valid_iot_infos.push(InfoWithEntityKey {
              info_key: iot_infos[j],
              entity_key: entity_keys[start + j].clone(),
            });
          }
        }
        None => {}
      }
      match mobile_info_acc {
        Some(raw_info) => {
          let mut data = raw_info.data.as_slice();
          let parsed_info = MobileHotspotInfoV0::try_deserialize(&mut data).context(format!(
            "Failed to deserialize mobile info acc, {}",
            mobile_infos[j].to_string()
          ))?;
          if parsed_info.is_active != is_active {
            valid_mobile_infos.push(InfoWithEntityKey {
              info_key: mobile_infos[j],
              entity_key: entity_keys[start + j].clone(),
            });
          }
        }
        None => {}
      }
    }
  }
  progress_bar.finish_with_message("Finished fetching accounts");

  // construct ixs
  let iot_ixs = construct_ix_from_valid_infos(
    helium_entity_program,
    valid_iot_infos,
    iot_rec,
    iot_sd,
    is_active,
  )
  .context("Failed to construct iot ixs")?;
  let mobile_ixs = construct_ix_from_valid_infos(
    helium_entity_program,
    valid_mobile_infos,
    mobile_rec,
    mobile_sd,
    is_active,
  )
  .context("Failed to construct mobile ixs")?;

  Ok((iot_ixs, mobile_ixs))
}

fn construct_ix_from_valid_infos(
  helium_entity_program: &Program,
  valid_infos: Vec<InfoWithEntityKey>,
  rewardable_entity_config: Pubkey,
  sub_dao: Pubkey,
  is_active: bool,
) -> Result<Vec<Instruction>> {
  let ixs = valid_infos
    .iter()
    .map(|info| {
      let entity_key = &bs58::decode(info.entity_key.clone())
        .into_vec()
        .context(format!("Failed to decode entity key, {}", info.entity_key))?;
      let set_entity_active_ix = helium_entity_program
        .request()
        .args(helium_entity_manager::instruction::SetEntityActiveV0 {
          args: SetEntityActiveArgsV0 {
            is_active,
            entity_key: entity_key.clone(),
          },
        })
        .accounts(SetEntityActiveV0 {
          active_device_authority: helium_entity_program.payer(),
          rewardable_entity_config,
          sub_dao,
          info: info.info_key,
          helium_sub_daos_program: helium_sub_daos::id(),
        })
        .instructions()
        .map_err(|e| anyhow!("Failed to construct instruction: {e}"))?;
      Ok(set_entity_active_ix[0].clone())
    })
    .collect::<Result<Vec<_>>>()
    .context("Failed to construct ixs")?;

  Ok(ixs)
}

async fn save_checkpoint(
  hashset: HashSet<String>,
  s3_config: HashMap<String, String>,
  file_name: &str,
) -> Result<()> {
  let checkpoint = ActiveCheckpoint { set: hashset };
  let json_data = serde_json::to_string(&checkpoint).context("Failed to serialize data")?;

  let bucket_name = s3_config.get("bucket_name").unwrap();
  let bucket = create_bucket(s3_config.clone()).context("Failed to create s3 bucket object")?;
  bucket
    .put_object(
      format!("/{}/{}", bucket_name, file_name),
      json_data.as_bytes(),
    )
    .await?;

  Ok(())
}

async fn load_checkpoint(
  s3_config: HashMap<String, String>,
  file_name: &str,
) -> Result<HashSet<String>> {
  let bucket_name = s3_config.get("bucket_name").unwrap();
  let bucket = create_bucket(s3_config.clone()).context("Failed to create s3 bucket object")?;
  let file_contents_buffer = bucket
    .get_object(format!("/{}/{}", bucket_name, file_name))
    .await?;

  let checkpoint: ActiveCheckpoint = serde_json::from_slice(&file_contents_buffer.as_slice())
    .context("Failed to deserialize checkpoint")?;

  Ok(checkpoint.set)
}

fn create_bucket(s3_config: HashMap<String, String>) -> Result<Bucket> {
  // Set up AWS credentials and region
  let access_key = s3_config.get("aws_access_key_id").unwrap();
  let secret_key = s3_config.get("aws_secret_access_key").unwrap();
  let region: Region;
  let endpoint_opt = s3_config.get("aws_endpoint");
  let region_str = s3_config.get("aws_default_region").unwrap().clone();
  if endpoint_opt.is_some() {
    region = Region::Custom {
      region: region_str,
      endpoint: s3_config.get("aws_endpoint").unwrap().clone(),
    };
  } else {
    region = Region::from_str(&region_str).unwrap();
  }
  let credentials = Credentials::new(Some(&access_key), Some(&secret_key), None, None, None)?;
  let bucket_name = s3_config.get("bucket_name").unwrap();

  Ok(Bucket::new(bucket_name, region, credentials)?)
}
