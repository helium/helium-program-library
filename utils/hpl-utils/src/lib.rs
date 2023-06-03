use std::{
  collections::HashMap,
  sync::Arc,
  thread::sleep,
  time::{Duration, Instant},
};

use indicatif::{ProgressBar, ProgressStyle};
use solana_client::{
  rpc_client::RpcClient,
  rpc_config::RpcSendTransactionConfig,
  tpu_client::{TpuClient, TpuSenderError},
};
use solana_sdk::transaction::{TransactionError, VersionedTransaction};

pub mod token;

pub const TRANSACTION_RESEND_INTERVAL: Duration = Duration::from_secs(4);
pub const MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS: usize = 256;
pub const SEND_TRANSACTION_INTERVAL: Duration = Duration::from_millis(10);

// This is based on tpu_client but rewritten to work with raw versioned txs
pub fn send_and_confirm_messages_with_spinner(
  rpc_client: Arc<RpcClient>,
  tpu_client: &TpuClient,
  messages: &Vec<Vec<u8>>,
) -> Result<(Vec<Option<TransactionError>>, i32), TpuSenderError> {
  if messages.is_empty() {
    return Ok((vec![], 0));
  }
  let mut failed_tx_count: i32 = 0;
  let progress_bar = ProgressBar::new(42);
  progress_bar.set_style(
    ProgressStyle::default_spinner()
      .template("{spinner:.green} {wide_msg}")
      .unwrap(),
  );
  progress_bar.enable_steady_tick(Duration::from_millis(100));
  progress_bar.set_message("Setting up...");

  let transactions_with_sigs: Vec<(usize, Vec<u8>, VersionedTransaction)> = messages
    .into_iter()
    .enumerate()
    .map(|(idx, tx)| {
      let vt: VersionedTransaction = bincode::deserialize(&tx).unwrap();
      (idx, tx.clone(), vt)
    })
    .collect();
  let total_transactions = transactions_with_sigs.len();
  let mut transaction_errors = vec![None; transactions_with_sigs.len()];
  let mut confirmed_transactions = 0;
  let mut block_height = rpc_client.get_block_height()?;

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
          if let Err(err) = rpc_client.send_transaction_with_config(
            deser,
            RpcSendTransactionConfig {
              skip_preflight: true,
              ..RpcSendTransactionConfig::default()
            },
          ) {
            confirmed_transactions += 1;
            failed_tx_count += 1;
            progress_bar.println(format!(
              "Failed transaction: {} {:?}",
              deser.signatures[0], err
            ));
          }
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
      if let Ok(result) = rpc_client.get_signature_statuses(pending_signatures_chunk) {
        let statuses = result.value;
        for (signature, status) in pending_signatures_chunk.iter().zip(statuses.into_iter()) {
          if let Some(status) = status {
            if status.satisfies_commitment(rpc_client.commitment()) {
              if let Some((i, _, _)) = pending_transactions.remove(signature) {
                confirmed_transactions += 1;
                if status.err.is_some() {
                  failed_tx_count += 1;

                  progress_bar.println(format!("Failed transaction: {} {:?}", signature, status));
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
      return Ok((transaction_errors, failed_tx_count));
    }
  }

  progress_bar.println(format!("Blockhash expired",));
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
