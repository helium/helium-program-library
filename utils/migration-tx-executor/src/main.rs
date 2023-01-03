use std::{env, rc::Rc};

use postgres::{Client, NoTls};
use clap::Parser;
use serde_json::{Result, Value};
use solana_client::tpu_client::{TpuClient, TpuClientConfig};
use anchor_client::{Client as AnchorClient, solana_sdk::{signature::read_keypair_file, commitment_config::CommitmentConfig}, Cluster};

fn parse_json(json: &str) -> Result<Value> {
    let v: Value = serde_json::from_str(json)?;
    Ok(v)
}

/// Program to execute txns
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
   #[arg(short, long)]
   wallet: Option<String>,
}

struct Transaction {
  id: i64,
  wallet: String,
  compiled: Vec<u8>,
  proof: Value,
  lookup_table: String
}

fn main() {
  let pg_url = env::var("POSTGRES_URL").expect("POSTGRES_URL must be set");
  let solana_url = env::var("SOLANA_URL").expect("SOLANA_URL must be set");
  let mut conn = Client::connect(&pg_url.to_string(), NoTls)
            .unwrap();
  let args = Args::parse();
  let payer = read_keypair_file(&*shellexpand::tilde("~/.config/solana/id.json"))
        .expect("requires a keypair file");
  let anchor_client = AnchorClient::new_with_options(
    Cluster::Custom(solana_url.clone(), solana_url.clone()), 
    Rc::new(payer), 
    CommitmentConfig::processed()
  );
  let program = anchor_client.program(lazy_transactions::ID)

  let rpc_client = solana_client::rpc_client::RpcClient::new(solana_url.clone());
  let tpu_client = TpuClient::new(rpc_client.into(), solana_url.as_str(), TpuClientConfig::default()).unwrap();
  
  let wallets = match args.wallet {
    Some(wallet) => vec![wallet],
    None => 
      conn.query("SELECT wallet, count(*) FROM transactions GROUP BY wallet ORDER BY count DESC", &[])
      .unwrap()
      .iter()
      .map(|row| row.get(0))
      .collect()
  };

  for wallet in wallets {
    let txns: Vec<Transaction> = conn.query("SELECT id, wallet, compiled, proof, lookup_table FROM transactions WHERE wallet = $1", &[&wallet])
      .unwrap()
      .iter()
      .map(|row| Transaction {
        id: row.get(0),
        wallet: row.get(1),
        compiled: row.get(2),
        proof: parse_json(row.get(3)).unwrap(),
        lookup_table: row.get(4),
      })
      .collect();

    let executable = txns.into_iter().map(|txn| {
      println!("Found {} {} {}", txn.wallet, txn.proof, txn.lookup_table);
      program.request().accounts(lazy_transactions::accounts::Execute {
        payer: txn.wallet,
        proof: txn.proof,
        lookup_table: txn.lookup_table,
      }).args(lazy_transactions::instruction::Execute {
        compiled: txn.compiled,
      }).send().unwrap()

      tpu_client.send_and_confirm_messages_with_spinner(messages, signers)
    });
  }
}
