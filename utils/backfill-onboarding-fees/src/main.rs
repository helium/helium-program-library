use std::{collections::HashMap, rc::Rc};

use anchor_client::{Client, Cluster};
use anyhow::{anyhow, Context, Result};
use clap::Parser;
use helium_entity_manager::{
  accounts::TempBackfillOnboardingFeesV0, IotHotspotInfoV0, KeyToAssetV0,
};
use hpl_utils::{
  dao::{Dao, SubDao},
  send_and_confirm_messages_with_spinner,
};
use solana_client::tpu_client::{TpuClient, TpuClientConfig};
use solana_sdk::{
  commitment_config::CommitmentConfig, signature::read_keypair_file, signer::Signer,
  transaction::Transaction,
};

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

#[tokio::main]
async fn main() -> Result<()> {
  let args = Args::parse();

  let kp = Rc::new(read_keypair_file(args.keypair).unwrap());
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
  let helium_entity_program = anchor_client.program(helium_entity_manager::id());
  let tpu_client = TpuClient::new(
    helium_entity_program.rpc().into(),
    &wss_url,
    TpuClientConfig::default(),
  )
  .unwrap();

  let infos = helium_entity_program.accounts::<IotHotspotInfoV0>(vec![])?;
  println!("Found {} iot hotspots", infos.len());
  let ktas = helium_entity_program.accounts::<KeyToAssetV0>(vec![])?;
  let ktas_by_asset: HashMap<_, _> = ktas
    .iter()
    .filter(|kta| kta.1.dao == Dao::Hnt.key())
    .map(|(k, kta)| (kta.asset, (k, kta)))
    .collect();

  let ixs: Vec<solana_sdk::instruction::Instruction> = infos
    .iter()
    .map(|(key, info)| {
      if ktas_by_asset.get(&info.asset).is_none() {
        return Ok(vec![]);
      }
      helium_entity_program
        .request()
        .args(helium_entity_manager::instruction::TempBackfillOnboardingFeesV0 {})
        .accounts(TempBackfillOnboardingFeesV0 {
          active_device_authority: kp.pubkey(),
          sub_dao: SubDao::Iot.key(),
          key_to_asset: *ktas_by_asset.get(&info.asset).unwrap().0,
          dao: Dao::Hnt.key(),
          rewardable_entity_config: SubDao::Iot.rewardable_entity_config_key(),
          iot_info: *key,
        })
        .instructions()
        .map_err(|e| anyhow!("Failed to construct instruction: {e}"))
    })
    .collect::<Result<Vec<_>>>()?
    .into_iter()
    .flatten()
    .collect();

  let transaction_batch_size = 100;
  let ixs_per_tx = 10;
  println!("Ixs to execute: {}", ixs.len());
  println!(
    "Txs to execute: {}",
    (ixs.len() + ixs_per_tx - 1) / ixs_per_tx
  );

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
      tx.try_sign(&[kp.as_ref()], blockhash)
        .map_err(|e| anyhow!("Error while signing tx: {e}"))?;
      txs.push(tx);
    }

    let serialized_txs = txs
      .iter()
      .map(|tx| bincode::serialize(&tx.clone()).map_err(|e| anyhow!("Failed to serialize tx: {e}")))
      .collect::<Result<Vec<_>, anyhow::Error>>()
      .context("Failed to serialize txs")?;

    let (_, failed_tx_count) = send_and_confirm_messages_with_spinner(
      helium_entity_program.rpc().into(),
      &tpu_client,
      &serialized_txs,
    )
    .context("Failed sending transactions")?;

    if failed_tx_count > 0 {
      return Err(anyhow!("{} transactions failed", failed_tx_count));
    }
  }

  Ok(())
}
