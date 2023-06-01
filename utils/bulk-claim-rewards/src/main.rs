mod claim_rewards;
use anchor_client::{Client, Cluster, Program};
use anchor_lang::prelude::*;
use bs58;
use claim_rewards::claim_rewards;
use clap::Parser;
use data_credits::ID as DC_PID;
use helium_entity_manager::{
    accounts::{IssueDataOnlyEntityV0, OnboardDataOnlyIotHotspotV0},
    DataOnlyConfigV0, IssueDataOnlyEntityArgsV0, KeyToAssetV0, OnboardDataOnlyIotHotspotArgsV0,
    ECC_VERIFIER, ID as HEM_PID,
};
use helium_sub_daos::ID as HSD_PID;
use mpl_bubblegum::ID as BGUM_PID;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use solana_program::system_program;
use solana_sdk::{
    commitment_config::CommitmentConfig, compute_budget::ComputeBudgetInstruction, signer::Signer,
    transaction::Transaction,
};
use solana_sdk::{
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair},
};
use spl_associated_token_account::get_associated_token_address;
use std::env;
use std::rc::Rc;
use std::str::FromStr;

/// Program to execute txns
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Solana paper wallet that will be the holder of the hotspot
    #[arg(short, long)]
    keypair: String,
    /// RPC url, defaults to https://api.mainnet-beta.solana.com
    #[arg(short, long)]
    url: String,

    #[arg(long)]
    batch_size: Option<usize>,
}

const HNT_MINT: &str = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const TOKEN_METADATA: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const NOOP: &str = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
const COMPRESSION: &str = "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK";
const IOT_MINT: &str = "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns";
const DC_MINT: &str = "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm";
const MOBILE_MINT: &str = "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6";

fn run() {
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

    let iot_mint = Pubkey::from_str(IOT_MINT).unwrap();
    let mobile_mint = Pubkey::from_str(MOBILE_MINT).unwrap();
    let hnt_mint = Pubkey::from_str(HNT_MINT).unwrap();
    let (dao, _dao_bump) =
        Pubkey::find_program_address(&["dao".as_bytes(), hnt_mint.as_ref()], &HSD_PID);

    let batch_size = match args.batch_size {
        Some(size) => size,
        None => 100,
    };
    claim_rewards(
        &ld_program,
        &ro_program,
        &kp.clone(),
        ld_program.payer(),
        iot_mint,
        dao,
        batch_size,
    )
    .unwrap();
}

fn main() {
    run();
}
