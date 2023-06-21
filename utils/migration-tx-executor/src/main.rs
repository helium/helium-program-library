use std::{
  env,
  sync::Arc,
  time::{Duration},
};
use clap::Parser;
use lazy_static::lazy_static;
use prometheus::{IntCounter, Registry};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use solana_client::{
  rpc_client::RpcClient,
  tpu_client::{TpuClient, TpuClientConfig},
};
use solana_sdk::{
  commitment_config::CommitmentConfig,
};
use warp::{Filter, Rejection, Reply};
use hpl_utils::send_and_confirm_messages_with_spinner;

lazy_static! {
  pub static ref REGISTRY: Registry = Registry::new();
  pub static ref NUM_SENT: IntCounter =
    IntCounter::new("transactions_sent", "Sent transactions").expect("metric can be created");
  pub static ref FAILED_TX: IntCounter =
    IntCounter::new("transactions_failed", "Failed transactions").expect("metric can be created");
  pub static ref NUM_WALLETS: IntCounter =
    IntCounter::new("wallets_processed", "Number of wallets processed")
      .expect("metric can be created");
  pub static ref WALLETS_TOTAL: IntCounter =
    IntCounter::new("wallets_total", "Total number of wallets").expect("metric can be created");
  pub static ref NUM_TOTAL: IntCounter =
    IntCounter::new("transactions_total", "Total number of transactions")
      .expect("metric can be created");
}

fn register_custom_metrics() {
  REGISTRY
    .register(Box::new(NUM_SENT.clone()))
    .expect("collector can be registered");
  REGISTRY
    .register(Box::new(FAILED_TX.clone()))
    .expect("collector can be registered");

  REGISTRY
    .register(Box::new(NUM_WALLETS.clone()))
    .expect("collector can be registered");

  REGISTRY
    .register(Box::new(WALLETS_TOTAL.clone()))
    .expect("collector can be registered");

  REGISTRY
    .register(Box::new(NUM_TOTAL.clone()))
    .expect("collector can be registered");
}

/// Program to execute txns
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  #[arg(short, long)]
  wallet: Option<String>,
  /// Whether to migrate all at once
  #[arg(short, long, action)]
  all: bool,
  /// Whether to migrate all hotspots
  #[arg(long, action)]
  hotspots: bool,
  /// Migrate a single hotspot
  #[arg(long, action)]
  hotspot: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct WalletResponse {
  pub wallet: String,
  pub count: u32,
}

#[derive(Deserialize, Serialize, Default)]
struct TransactionResponse {
  pub count: u32,
  pub transactions: Vec<Vec<u8>>,
}

async fn run_transactions(
  migration_url: String,
  solana_url: String,
  solana_wss_url: String,
  args: Args,
) {
  let rpc_client: Arc<RpcClient> = solana_client::rpc_client::RpcClient::new_with_commitment(
    solana_url.clone(),
    CommitmentConfig {
      commitment: solana_sdk::commitment_config::CommitmentLevel::Confirmed,
    },
  )
  .into();
  let tpu_client = TpuClient::new(
    rpc_client.clone(),
    &solana_wss_url,
    TpuClientConfig::default(),
  )
  .unwrap();
  let client = Client::new();

  let wallets_with_counts = match args.wallet {
    Some(wallet) => vec![WalletResponse { wallet, count: 0 }],
    None => {
      if args.all || args.hotspots {
        vec![]
      } else {
        let results = client
          .get(format!("{}/{}", migration_url, "top-wallets").as_str())
          .send()
          .await
          .unwrap()
          .json::<Vec<WalletResponse>>()
          .await
          .unwrap();

        results
      }
    }
  };

  let wallets: Vec<&str> = wallets_with_counts
    .iter()
    .map(|result| result.wallet.as_str())
    .collect();
  let total_wallets = wallets.len();
  let total_transactions = wallets_with_counts
    .iter()
    .map(|wallet| wallet.count)
    .sum::<u32>();
  WALLETS_TOTAL.inc_by(total_wallets as u64);
  NUM_TOTAL.inc_by(total_transactions as u64);

  if args.all {
    let limit = 1000;
    let mut offset = 0;
    loop {
      let url = format!(
        "{}/migrate?limit={}&offset={}",
        migration_url, limit, offset
      );
      println!("{}", url);
      let response = client
        .get(url.as_str())
        .send()
        .await
        .unwrap()
        .json::<TransactionResponse>()
        .await
        .unwrap();

      if offset > response.count {
        break;
      }

      let result = send_and_confirm_messages_with_spinner(
        rpc_client.clone(),
        &tpu_client,
        &response.transactions,
      );
      if result.is_ok() {
        offset += limit;
        FAILED_TX.inc_by(result.unwrap().1.try_into().unwrap());
      }
      NUM_SENT.inc_by(response.transactions.len() as u64);
    }
  } else if args.hotspots {
    let limit = 1000;
    let mut offset = 0;
    loop {
      let url = format!(
        "{}/migrate/hotspots?limit={}&offset={}",
        migration_url, limit, offset
      );
      println!("{}", url);
      let response = client
        .get(url.as_str())
        .send()
        .await
        .unwrap()
        .json::<TransactionResponse>()
        .await
        .unwrap();

      if offset > response.count {
        break;
      }

      let result = send_and_confirm_messages_with_spinner(
        rpc_client.clone(),
        &tpu_client,
        &response.transactions,
      );
      if result.is_ok() {
        offset += limit;
        FAILED_TX.inc_by(result.unwrap().1.try_into().unwrap());
      }
      NUM_SENT.inc_by(response.transactions.len() as u64);
    }
  } else if args.hotspot.is_some() {
    let url = format!(
      "{}/migrate/hotspot/{}?limit=1&offset=0",
      migration_url, args.hotspot.unwrap()
    );
    println!("{}", url);
    let response = client
      .get(url.as_str())
      .send()
      .await
      .unwrap()
      .json::<TransactionResponse>()
      .await
      .unwrap();

    let result = send_and_confirm_messages_with_spinner(
      rpc_client.clone(),
      &tpu_client,
      &response.transactions,
    );
    FAILED_TX.inc_by(result.unwrap().1.try_into().unwrap());
    NUM_SENT.inc_by(response.transactions.len() as u64);
    
  } else {
    for wallet in wallets {
      println!("Migrating wallet {}", wallet);
      let limit = 1000;
      let mut offset = 0;
      loop {
        let url = format!(
          "{}/migrate/{}?limit={}&offset={}",
          migration_url, wallet, limit, offset
        );
        println!("{}", url);
        let response = client
          .get(url.as_str())
          .send()
          .await
          .unwrap()
          .json::<TransactionResponse>()
          .await
          .unwrap();

        if offset > response.count {
          break;
        }

        let result = send_and_confirm_messages_with_spinner(
          rpc_client.clone(),
          &tpu_client,
          &response.transactions,
        );
        if result.is_ok() {
          offset += limit;
          FAILED_TX.inc_by(result.unwrap().1.try_into().unwrap());
        }
        NUM_SENT.inc_by(response.transactions.len() as u64);
      }
      NUM_WALLETS.inc()
    }
  }
}

async fn metrics_handler() -> Result<impl Reply, Rejection> {
  use prometheus::Encoder;
  let encoder = prometheus::TextEncoder::new();

  let mut buffer = Vec::new();
  if let Err(e) = encoder.encode(&REGISTRY.gather(), &mut buffer) {
    eprintln!("could not encode custom metrics: {}", e);
  };
  let mut res = match String::from_utf8(buffer.clone()) {
    Ok(v) => v,
    Err(e) => {
      eprintln!("custom metrics could not be from_utf8'd: {}", e);
      String::default()
    }
  };
  buffer.clear();

  let mut buffer = Vec::new();
  if let Err(e) = encoder.encode(&prometheus::gather(), &mut buffer) {
    eprintln!("could not encode prometheus metrics: {}", e);
  };
  let res_custom = match String::from_utf8(buffer.clone()) {
    Ok(v) => v,
    Err(e) => {
      eprintln!("prometheus metrics could not be from_utf8'd: {}", e);
      String::default()
    }
  };
  buffer.clear();

  res.push_str(&res_custom);
  Ok(res)
}

#[tokio::main]
async fn main() {
  let migration_url = env::var("MIGRATION_SERVICE_URL").expect("MIGRATION_SERVICE_URL must be set");
  let solana_url = env::var("SOLANA_URL").expect("SOLANA_URL must be set");
  let solana_wss_url = env::var("SOLANA_WSS_URL").expect("SOLANA_WSS_URL must be set");
  let args = Args::parse();

  register_custom_metrics();
  let metrics_route = warp::path!("metrics").and_then(metrics_handler);
  tokio::spawn(warp::serve(metrics_route).run(([0, 0, 0, 0], 8080)));

  run_transactions(migration_url, solana_url, solana_wss_url, args).await;
}
