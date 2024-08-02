use std::{
  collections::HashMap, env, thread::sleep, time::{Duration, Instant}
};

use indicatif::{ProgressBar, ProgressStyle};
use solana_client::{
  rpc_client::RpcClient,
  rpc_config::RpcSendTransactionConfig,
  tpu_client::{TpuClient, TpuSenderError},
};
use anyhow::{anyhow, Context};
use solana_connection_cache::connection_cache::{
  ConnectionManager, ConnectionPool, NewConnectionConfig,
};
use solana_sdk::{compute_budget::ComputeBudgetInstruction, instruction::Instruction, signature::{Keypair, Signature}, signer::Signer, transaction::{Transaction, TransactionError, VersionedTransaction}};

pub mod dao;
pub mod program;
pub mod token;

pub const TRANSACTION_RESEND_INTERVAL: Duration = Duration::from_secs(4);
pub const MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS: usize = 256;
pub const SEND_TRANSACTION_INTERVAL: Duration = Duration::from_millis(10);

pub struct SendResult {
  pub failure_count: i32,
  pub failures: Vec<Option<TransactionError>>,
  pub confirmed_signatures: Vec<Option<Signature>>
}

// This is based on tpu_client but rewritten to work with raw versioned txs
pub fn send_and_confirm_messages_with_spinner<
  P: ConnectionPool<NewConnectionConfig = C>,
  M: ConnectionManager<ConnectionPool = P, NewConnectionConfig = C>,
  C: NewConnectionConfig,
>(
  rpc_client: &RpcClient,
  tpu_client: &TpuClient<P, M, C>,
  messages: &Vec<Vec<u8>>,
) -> Result<SendResult, TpuSenderError> {
  if messages.is_empty() {
    return Ok(SendResult {
      failure_count: 0,
      failures: vec![],
      confirmed_signatures: vec![]
    });
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
  let mut confirmed_signatures = vec![None; transactions_with_sigs.len()];
  let mut confirmed_transactions = 0;
  let mut block_height = rpc_client.get_block_height()?;

  let (_, last_valid_block_height) =
    rpc_client.get_latest_blockhash_with_commitment(rpc_client.commitment())?;

  let mut pending_transactions = HashMap::new();
  for (idx, (_, transaction, deserialized)) in transactions_with_sigs.into_iter().enumerate() {
    pending_transactions.insert(deserialized.signatures[0], (idx, transaction, deserialized));
  }

  let mut last_resend = Instant::now() - TRANSACTION_RESEND_INTERVAL;
  while block_height <= last_valid_block_height && pending_transactions.len() > 0 {
    let num_transactions = pending_transactions.len();

    // Periodically re-send all pending transactions
    if Instant::now().duration_since(last_resend) > TRANSACTION_RESEND_INTERVAL {
      for (index, (_i, transaction, deser)) in pending_transactions.values().enumerate() {
        // Disabling TPU client because it doesn't work with SWQoS
        // if !tpu_client.send_wire_transaction(transaction.clone()) {
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
                confirmed_signatures[i] = Some(signature.clone());
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
  }



  Ok(SendResult {
    failure_count: failed_tx_count,
    failures: transaction_errors,
    confirmed_signatures
  })
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

const MAX_TX_LEN: usize = 1232;
const MAX_BLOCKHASH_RETRIES: usize = 50;

pub fn construct_and_send_txs<
  P: ConnectionPool<NewConnectionConfig = C>,
  M: ConnectionManager<ConnectionPool = P, NewConnectionConfig = C>,
  C: NewConnectionConfig,
>(
  rpc: &RpcClient,
  tpu_client: &TpuClient<P, M, C>,
  ixs: Vec<Instruction>,
  payer: &Keypair,
  dry_run: bool,
) -> Result<(), anyhow::Error> {
  if ixs.is_empty() {
    return Ok(());
  }
  // send transactions in batches so blockhash doesn't expire
  let transaction_batch_size = 100;
  println!("Ixs to execute: {}", ixs.len());
  let priority_fee_lamports: u32 = env::var("PRIORITY_FEE_LAMPORTS")
    .context("Failed to get env var PRIORITY_FEE_LAMPORTS")
    .and_then(|v| {
      v.parse::<u32>()
        .map_err(|e| anyhow!("Failed to parse PRIORITY_FEE_LAMPORTS: {}", e))
    })
    .unwrap_or(1);
  let mut instructions = vec![
    ComputeBudgetInstruction::set_compute_unit_limit(600000),
    ComputeBudgetInstruction::set_compute_unit_price(
      (f64::from(priority_fee_lamports) / (600000_f64 * 0.000001_f64)).ceil() as u64,
    ),
  ];
  let mut ix_groups = Vec::new();
  let blockhash = rpc.get_latest_blockhash()?;
  // Pack as many ixs as possible into a tx, then send batches of 100
  for ix in ixs {
    instructions.push(ix.clone());
    let mut tx = Transaction::new_with_payer(&instructions, Some(&payer.pubkey()));
    tx.try_sign(&[payer], blockhash)
      .map_err(|e| anyhow!("Error while signing tx: {e}"))?;
    let tx_len = bincode::serialize(&tx).unwrap().len();

    if tx_len > MAX_TX_LEN || tx.message.account_keys.len() > 64 {
      // clear instructions except for last one
      instructions.pop();
      ix_groups.push(instructions);

      // clear instructions except for last one
      instructions = vec![
        ComputeBudgetInstruction::set_compute_unit_limit(600000),
        ComputeBudgetInstruction::set_compute_unit_price(
          (f64::from(priority_fee_lamports) / (600000_f64 * 0.000001_f64)).ceil() as u64,
        ),
        ix.clone(),
      ];
    }
  }

  // Send last group of txns
  if instructions.len() > 0 {
    ix_groups.push(instructions);
  }

  if !dry_run {
    for tx_ix_group in ix_groups.chunks(transaction_batch_size) {
      let mut retries = 0;
      let confirmed_indexes: Vec<usize> = vec![];
      let mut group_to_send = tx_ix_group.to_vec();

      // Continually retry forming instruction groups into transactions and sending them until all are confirmed,
      // or blockhashes have expired too many times.
      while retries < MAX_BLOCKHASH_RETRIES {
        let blockhash = rpc.get_latest_blockhash()?;
        let txs: Vec<Transaction> = group_to_send
          .iter()
          .map(|group| {
            let mut tx = Transaction::new_with_payer(group, Some(&payer.pubkey()));
            tx.try_sign(&[payer], blockhash)
              .map_err(|e| anyhow!("Error while signing tx: {e}"))?;
            Ok(tx)
          })
          .collect::<Result<Vec<_>, anyhow::Error>>()?;

        let SendResult {
          failure_count,
          confirmed_signatures,
          ..
        } = send_and_confirm_messages_with_spinner(
          rpc,
          &tpu_client,
          &txs
            .iter()
            .map(|tx| {
              bincode::serialize(&tx.clone()).map_err(|e| anyhow!("Failed to serialize tx: {e}"))
            })
            .collect::<Result<Vec<_>, anyhow::Error>>()
            .context("Failed to serialize txs")?,
        )
        .context("Failed sending transactions")?;

        if failure_count > 0 {
          return Err(anyhow!("{} transactions failed", failure_count));
        }

        group_to_send = group_to_send
          .into_iter()
          .enumerate()
          .filter_map(|(i, group)| {
            if confirmed_signatures.get(i).is_some() {
              Some(group)
            } else {
              None
            }
          })
          .collect();

        if confirmed_indexes.is_empty() {
          break;
        }

        retries += 1;
      }

      if retries >= MAX_BLOCKHASH_RETRIES {
        return Err(anyhow!("Failed to send transactions"));
      }
    }
  }

  Ok(())
}