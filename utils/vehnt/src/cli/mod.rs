use super::*;

mod epoch_info;
mod delegated;

#[derive(Debug, clap::Parser)]
#[clap(version = env!("CARGO_PKG_VERSION"))]
#[clap(about = "spl-scrape")]
pub struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Debug, Clone, clap::Subcommand)]
pub enum Cmd {
    Delegated(delegated::Delegated),
    EpochInfo(epoch_info::EpochInfo),
}

impl Cli {
    pub async fn run(self, rpc_client: RpcClient) -> MyResult {
        match self.cmd {
            Cmd::Delegated(cmd) => cmd.run(rpc_client).await,
            Cmd::EpochInfo(cmd) => cmd.run(rpc_client).await,

        }
    }
}
