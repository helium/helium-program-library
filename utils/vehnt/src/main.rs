use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use std::str::FromStr;

mod cli;
mod error;
mod types;

pub use types::*;
pub type MyResult<T = ()> = Result<T, error::Error>;

#[tokio::main]
async fn main() -> MyResult {
  use clap::Parser;
  let cli = cli::Cli::parse();
  let rpc_client =
    RpcClient::new_with_commitment(cli.solana_url.to_string(), CommitmentConfig::confirmed());
  cli.run(rpc_client).await
}
