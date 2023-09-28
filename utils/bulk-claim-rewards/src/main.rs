mod claim_rewards;
use crate::claim_rewards::ClaimRewardsArgs;
use claim_rewards::claim_rewards;
use clap::Parser;
use hpl_utils::dao::{Dao, SubDao};
use solana_sdk::signature::read_keypair_file;
use solana_sdk::signer::Signer;
use std::rc::Rc;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  /// Solana paper wallet that will be the holder of the hotspot
  #[arg(short, long)]
  keypair: String,
  #[arg(long)]
  hotspot_owner: Option<String>,
  /// RPC url, defaults to https://api.mainnet-beta.solana.com
  #[arg(short, long)]
  url: String,
  /// SubDao to claim rewards from
  #[arg(long)]
  sub_dao: SubDao,
  /// Number of NFTs to check at a time. Defaults to 100
  #[arg(long, default_value = "100")]
  batch_size: usize,
}

async fn run() {
  // parse args
  let args = Args::parse();

  // load the solana paper wallet
  let kp = read_keypair_file(args.keypair).unwrap();
  let pk = kp.pubkey().clone();
  let rewards_mint = *args.sub_dao.mint();
  let dao = Dao::Hnt.key();
  let start = Instant::now();

  claim_rewards(ClaimRewardsArgs {
    rpc_url: args.url.as_str(),
    payer: kp,
    hotspot_owner: args.hotspot_owner.map(|s| s.parse().unwrap()).unwrap_or_else(|| pk),
    rewards_mint,
    dao,
    batch_size: args.batch_size,
  })
  .await
  .unwrap();
  let duration = start.elapsed();

  println!("Time elapsed is: {:?}", duration);
}

#[tokio::main]
async fn main() {
  run().await;
}
