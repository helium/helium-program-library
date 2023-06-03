mod claim_rewards;
use anchor_client::{Client, Cluster};
use anyhow::anyhow;
use claim_rewards::claim_rewards;
use clap::Parser;
use helium_sub_daos::ID as HSD_PID;
use hpl_utils::token::HeliumToken;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::{pubkey::Pubkey, signature::read_keypair_file};
use std::rc::Rc;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Solana paper wallet that will be the holder of the hotspot
    #[arg(short, long)]
    keypair: String,
    /// RPC url, defaults to https://api.mainnet-beta.solana.com
    #[arg(short, long)]
    url: String,
    /// Type of rewards to claim, either 'iot' or 'mobile'
    #[arg(long)]
    rewards_type: String,
    /// Number of NFTs to check at a time. Defaults to 100
    #[arg(long)]
    batch_size: Option<usize>,
    /// Initializes the onchain structs required to claim rewards. Defaults to true.
    /// Only needs to be run once for new hotspots.
    /// Disabling this will save time if these structs are already initialized.
    #[arg(long)]
    init_recipients: Option<bool>,
}

async fn run() {
    // parse args
    let args = Args::parse();

    // load the solana paper wallet
    let kp = Rc::new(read_keypair_file(args.keypair).unwrap());
    let anchor_client = Client::new_with_options(
        Cluster::Custom(
            args.url.clone(),
            args.url
                .clone()
                .replace("https", "wss")
                .replace("http", "ws"),
        ),
        kp.clone(),
        CommitmentConfig::confirmed(),
    );

    let ld_program = anchor_client.program(lazy_distributor::id());
    let ro_program = anchor_client.program(rewards_oracle::id());

    let rewards_mint = match args.rewards_type.as_str() {
        "iot" => Ok(*HeliumToken::Iot.mint()),
        "mobile" => Ok(*HeliumToken::Mobile.mint()),
        _ => Err(anyhow!(
            "Invalid rewards type. Must be either 'iot' or 'mobile'"
        )),
    }
    .unwrap();

    let (dao, _dao_bump) = Pubkey::find_program_address(
        &["dao".as_bytes(), HeliumToken::Hnt.mint().as_ref()],
        &HSD_PID,
    );

    let batch_size = match args.batch_size {
        Some(size) => size,
        None => 100,
    };
    let init_recipients = match args.init_recipients {
        Some(init) => init,
        None => true,
    };
    let start = Instant::now();

    claim_rewards(
        &ld_program,
        &ro_program,
        &kp.clone(),
        ld_program.payer(),
        rewards_mint,
        dao,
        batch_size,
        init_recipients,
    )
    .await
    .unwrap();
    let duration = start.elapsed();

    println!("Time elapsed is: {:?}", duration);
}

#[tokio::main]
async fn main() {
    run().await;
}
