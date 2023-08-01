mod claim_rewards;
use anchor_client::{Client, Cluster};
use anyhow::anyhow;
use claim_rewards::claim_rewards;
use clap::Parser;
use helium_sub_daos::ID as HSD_PID;
use hpl_utils::token::HeliumToken;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::{pubkey::Pubkey, signature::read_keypair_file};
use std::rc::Rc;
use std::time::Instant;
use std::str::FromStr;

use crate::claim_rewards::ClaimRewardsArgs;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  /// Solana paper wallet that will be the holder of the hotspot
  #[arg(short, long)]
  keypair: String,
  #[arg(long)]
  hotspot_owner: Option<String>,
  /// RPC url, defaults to https://api.mainnet-beta.solana.com
  #[arg(short, long)]
  url: String,
  /// Type of rewards to claim, either 'iot' or 'mobile'
  #[arg(long)]
  rewards_type: String,
  /// Number of NFTs to check at a time. Defaults to 100
  #[arg(long, default_value = "100")]
  batch_size: usize,
}

async fn run() {
  // parse args
  let args = Args::parse();

  // load the solana paper wallet
  let kp = Rc::new(read_keypair_file(args.keypair).unwrap());
  let anchor_client = Client::new_with_options(
    Cluster::Custom(
      args.url.clone(),
      args
        .url
        .clone()
        .replace("https", "wss")
        .replace("http", "ws"),
    ),
    kp.clone(),
    CommitmentConfig::confirmed(),
  );

  let ld_program = anchor_client.program(lazy_distributor::id());
  let ro_program = anchor_client.program(rewards_oracle::id());

  let rewards_mint = match args.rewards_type.as_str() {
    "iot" => Ok(*HeliumToken::Iot.mint()),
    "mobile" => Ok(*HeliumToken::Mobile.mint()),
    _ => Err(anyhow!(
      "Invalid rewards type. Must be either 'iot' or 'mobile'"
    )),
  }
  .unwrap();

  let (dao, _dao_bump) = Pubkey::find_program_address(
    &["dao".as_bytes(), HeliumToken::Hnt.mint().as_ref()],
    &HSD_PID,
  );

  let batch_size = args.batch_size;
  let start = Instant::now();

  claim_rewards(ClaimRewardsArgs {
    lazy_distributor_program: &ld_program,
    rewards_oracle_program: &ro_program,
    payer: &kp.clone(),
    hotspot_owner: args.hotspot_owner.map(|p| Pubkey::from_str(&p).unwrap()).unwrap_or_else(|| ld_program.payer()),
    rewards_mint,
    dao,
    batch_size,
  })
  .await
  .unwrap();
  let duration = start.elapsed();

  println!("Time elapsed is: {:?}", duration);
}

#[tokio::main]
async fn main() {
  run().await;
}
