use std::{collections::HashMap, env, time::{Instant, Duration}, thread::sleep, rc::Rc, sync::Arc};

use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use solana_client::{
  rpc_client::RpcClient,
  tpu_client::{TpuClient, TpuClientConfig, TpuSenderError},
};
use solana_sdk::{message::{Message, VersionedMessage}, transaction::{TransactionError, VersionedTransaction}, signature::Signature, commitment_config::CommitmentConfig};
pub(crate) const TRANSACTION_RESEND_INTERVAL: Duration = Duration::from_secs(4);
pub const MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS: usize = 256;
pub(crate) const SEND_TRANSACTION_INTERVAL: Duration = Duration::from_millis(10);

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

fn main() {
  // let migration_url = env::var("MIGRATION_SERVICE_URL").expect("MIGRATION_SERVICE_URL must be set");
  // let solana_url = env::var("SOLANA_URL").expect("SOLANA_URL must be set");
  // let solana_wss_url = env::var("SOLANA_WSS_URL").expect("SOLANA_WSS_URL must be set");
  let migration_url = "http://localhost:8081";
  let solana_url = "https://api.devnet.solana.com";
  let solana_wss_url = "wss://api.devnet.solana.com";
  let args = Args::parse();

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

  let wallets = match args.wallet {
    Some(wallet) => vec![wallet],
    None => {
      let results = client
        .get(format!("{}/{}", migration_url, "top-wallets").as_str())
        .send()
        .unwrap()
        .json::<Vec<WalletResponse>>()
        .unwrap();

      results.into_iter().map(|result| result.wallet).collect()
    }
  };

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
      // for transaction in response.transactions {
      //   let sent = tpu_client.send_wire_transaction(transaction);
      //   if !sent {
      //     print!("Not sent")
      //   }
      // }
    }
  }
}

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
          // if !tpu_client.send_wire_transaction(transaction.clone()) {
            println!("{:?}", deser.message);
            let _result = rpc_client.send_transaction(deser).unwrap();
          // }
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
