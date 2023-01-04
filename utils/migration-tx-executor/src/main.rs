use std::{collections::HashMap, time::{Instant, Duration}, thread::sleep, sync::Arc, env};

use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use solana_client::{
  rpc_client::RpcClient,
  tpu_client::{TpuClient, TpuClientConfig, TpuSenderError},
};
use solana_sdk::{transaction::{TransactionError, VersionedTransaction}, commitment_config::CommitmentConfig};
use prometheus::{
    IntCounter, IntCounterVec, IntGauge, Opts, Registry,
};
use lazy_static::lazy_static;
use warp::{Rejection, Reply, Filter};

pub(crate) const TRANSACTION_RESEND_INTERVAL: Duration = Duration::from_secs(4);
pub const MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS: usize = 256;
pub(crate) const SEND_TRANSACTION_INTERVAL: Duration = Duration::from_millis(10);

lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();
    pub static ref NUM_SENT: IntCounter =
        IntCounter::new("transactions_sent", "Sent transactions").expect("metric can be created");
    pub static ref NUM_WALLETS: IntCounter =
        IntCounter::new("wallets_processed", "Number of wallets processed").expect("metric can be created");
    pub static ref WALLETS_TOTAL: IntCounter =
        IntCounter::new("wallets_total", "Total number of wallets").expect("metric can be created");
    pub static ref NUM_TOTAL: IntCounter =
        IntCounter::new("transactions_total", "Total number of transactions").expect("metric can be created");
}

fn register_custom_metrics() {
    REGISTRY
        .register(Box::new(NUM_SENT.clone()))
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
  args: Args
) {

  let rpc_client: Arc<RpcClient> = solana_client::rpc_client::RpcClient::new_with_commitment(
    solana_url.clone(),
    CommitmentConfig { commitment: solana_sdk::commitment_config::CommitmentLevel::Confirmed }
  ).into();
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
      let results = client
        .get(format!("{}/{}", migration_url, "top-wallets").as_str())
        .send()
        .unwrap()
        .json::<Vec<WalletResponse>>()
        .unwrap();

      results
    }
  };

  let wallets: Vec<&str> = wallets_with_counts.iter().map(|result| result.wallet.as_str()).collect();
  let total_wallets = wallets.len();
  let total_transactions = wallets_with_counts.iter().map(|wallet| wallet.count).sum::<u32>();
  WALLETS_TOTAL.inc_by(total_wallets as u64);
  NUM_TOTAL.inc_by(total_transactions as u64);

  for wallet in wallets {
    println!("Migrating wallet {}", wallet);
    let limit = 500;
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
        .unwrap()
        .json::<TransactionResponse>()
        .unwrap();

      if offset > response.count {
        break;
      }

      offset += limit;

      send_and_confirm_messages_with_spinner(
        rpc_client.clone(),
        &tpu_client,
        &response.transactions,
      ).unwrap();
      NUM_SENT.inc_by(response.transactions.len() as u64);
    }
    NUM_WALLETS.inc()
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
  
  tokio::task::spawn(run_transactions(
    migration_url,
    solana_url,
    solana_wss_url,
    args
  ));

  warp::serve(metrics_route)
      .run(([0, 0, 0, 0], 8080))
      .await;
}

// This is stolen from tpu_client but rewritten to work with raw versioned txs
pub fn send_and_confirm_messages_with_spinner(
  rpc_client: Arc<RpcClient>,
  tpu_client: &TpuClient,
  messages: &Vec<Vec<u8>>,
) -> Result<Vec<Option<TransactionError>>, TpuSenderError> {
  let mut expired_blockhash_retries = 5;

  let progress_bar = ProgressBar::new(42);
  progress_bar.set_style(ProgressStyle::default_spinner().template("{spinner:.green} {wide_msg}").unwrap());
  progress_bar.enable_steady_tick(Duration::from_millis(100));
  progress_bar.set_message("Setting up...");

  let mut transactions_with_sigs: Vec<(usize, Vec<u8>, VersionedTransaction)> = messages.into_iter().enumerate().map(|(idx, tx)| {
    let vt: VersionedTransaction = bincode::deserialize(&tx).unwrap();
    (idx, tx.clone(), vt)
  }).collect();
  let total_transactions = transactions_with_sigs.len();
  let mut transaction_errors = vec![None; transactions_with_sigs.len()];
  let mut confirmed_transactions = 0;
  let mut block_height = rpc_client.get_block_height()?;

  while expired_blockhash_retries > 0 {
    let (_, last_valid_block_height) =
      rpc_client.get_latest_blockhash_with_commitment(rpc_client.commitment())?;

    let mut pending_transactions = HashMap::new();
    for (idx, (_, transaction, deserialized)) in transactions_with_sigs.into_iter().enumerate() {
      pending_transactions.insert(deserialized.signatures[0], (idx, transaction, deserialized));
    }

    let mut last_resend = Instant::now() - TRANSACTION_RESEND_INTERVAL;
    while block_height <= last_valid_block_height {
      let num_transactions = pending_transactions.len();

      // Periodically re-send all pending transactions
      if Instant::now().duration_since(last_resend) > TRANSACTION_RESEND_INTERVAL {
        for (index, (_i, transaction, deser)) in pending_transactions.values().enumerate() {
          if !tpu_client.send_wire_transaction(transaction.clone()) {
            let _result = rpc_client.send_transaction(deser).unwrap();
          }
          set_message_for_confirmed_transactions(
            &progress_bar,
            confirmed_transactions,
            total_transactions,
            None, //block_height,
            last_valid_block_height,
            &format!("Sending {}/{} transactions", index + 1, num_transactions,),
          );
          sleep(SEND_TRANSACTION_INTERVAL);
        }
        last_resend = Instant::now();
      }

      // Wait for the next block before checking for transaction statuses
      let mut block_height_refreshes = 10;
      set_message_for_confirmed_transactions(
        &progress_bar,
        confirmed_transactions,
        total_transactions,
        Some(block_height),
        last_valid_block_height,
        &format!("Waiting for next block, {} pending...", num_transactions),
      );
      let mut new_block_height = block_height;
      while block_height == new_block_height && block_height_refreshes > 0 {
        sleep(Duration::from_millis(500));
        new_block_height = rpc_client.get_block_height()?;
        block_height_refreshes -= 1;
      }
      block_height = new_block_height;

      // Collect statuses for the transactions, drop those that are confirmed
      let pending_signatures = pending_transactions.keys().cloned().collect::<Vec<_>>();
      for pending_signatures_chunk in
        pending_signatures.chunks(MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS)
      {
        if let Ok(result) = rpc_client
          .get_signature_statuses(pending_signatures_chunk)
        {
          let statuses = result.value;
          for (signature, status) in pending_signatures_chunk.iter().zip(statuses.into_iter()) {
            if let Some(status) = status {
              if status.satisfies_commitment(rpc_client.commitment()) {
                if let Some((i, _, _)) = pending_transactions.remove(signature) {
                  confirmed_transactions += 1;
                  if status.err.is_some() {
                    progress_bar.println(format!("Failed transaction: {:?}", status));
                  }
                  transaction_errors[i] = status.err;
                }
              }
            }
          }
        }
        set_message_for_confirmed_transactions(
          &progress_bar,
          confirmed_transactions,
          total_transactions,
          Some(block_height),
          last_valid_block_height,
          "Checking transaction status...",
        );
      }

      if pending_transactions.is_empty() {
        return Ok(transaction_errors);
      }
    }

    transactions_with_sigs = pending_transactions.into_iter().map(|(_k, v)| v).collect();
    progress_bar.println(format!(
      "Blockhash expired. {} retries remaining",
      expired_blockhash_retries
    ));
    expired_blockhash_retries -= 1;
  }
  Err(TpuSenderError::Custom("Max retries exceeded".into()))
}

fn set_message_for_confirmed_transactions(
  progress_bar: &ProgressBar,
  confirmed_transactions: u32,
  total_transactions: usize,
  block_height: Option<u64>,
  last_valid_block_height: u64,
  status: &str,
) {
  progress_bar.set_message(format!(
    "{:>5.1}% | {:<40}{}",
    confirmed_transactions as f64 * 100. / total_transactions as f64,
    status,
    match block_height {
      Some(block_height) => format!(
        " [block height {}; re-sign in {} blocks]",
        block_height,
        last_valid_block_height.saturating_sub(block_height),
      ),
      None => String::new(),
    },
  ));
}
