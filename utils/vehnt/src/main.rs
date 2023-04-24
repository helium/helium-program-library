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
    let rpc_client = RpcClient::new_with_commitment(
        "https://rpc.helius.xyz/?api-key=273fb8b5-11ce-4d17-8983-a0ec012f8b17".to_string(),
        // "http://127.0.0.1:8899".to_string(),
        CommitmentConfig::confirmed(),
    );
    cli.run(rpc_client).await
}
