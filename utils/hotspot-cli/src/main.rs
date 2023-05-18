use anchor_client::{Client, Cluster, Program};
use anchor_lang::prelude::*;
use bs58;
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
    /// A base64 encoded AddGateway transaction
    #[arg(short, long)]
    transaction: String,
    /// The signature for the transaction
    #[arg(short, long)]
    signature: String,
    /// The entity key for the hotspot
    #[arg(short, long)]
    entity_key: String,
    /// The location of the hotspot
    #[arg(short, long)]
    location: Option<u64>,
    /// The elevation of the hotspot
    #[arg(short, long)]
    elevation: Option<i32>,
    /// The gain of the hotspot
    #[arg(short, long)]
    gain: Option<i32>,
}

#[derive(Deserialize, Serialize, Default)]
struct VerifyResponse {
    // hex encoded solana transaction
    pub transaction: String,
}

#[derive(Deserialize, Serialize, Default)]
struct VerifyRequest<'a> {
    // hex encoded solana transaction
    pub transaction: &'a str,
    // hex encoded signed message
    pub msg: &'a str,
    // hex encoded signature
    pub signature: &'a str,
}

const HNT_MINT: &str = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const TOKEN_METADATA: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const NOOP: &str = "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV";
const COMPRESSION: &str = "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK";
const IOT_MINT: &str = "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns";
const DC_MINT: &str = "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm";

fn construct_issue_entity_accounts(
    program: &Program,
    hnt_mint: Pubkey,
    entity_key: &Vec<u8>,
) -> IssueDataOnlyEntityV0 {
    let token_metadata_pid = Pubkey::from_str(TOKEN_METADATA).unwrap();
    let noop_pid = Pubkey::from_str(NOOP).unwrap();
    let compression_pid = Pubkey::from_str(COMPRESSION).unwrap();
    let (dao, _dao_bump) =
        Pubkey::find_program_address(&["dao".as_bytes(), hnt_mint.as_ref()], &HEM_PID);

    let (data_only_config, _data_only_bump) =
        Pubkey::find_program_address(&["data_only_config".as_bytes(), dao.as_ref()], &HEM_PID);

    let data_only_config_acc_raw = program.rpc().get_account(&data_only_config).unwrap();
    let data_only_config_acc =
        DataOnlyConfigV0::try_deserialize(&mut data_only_config_acc_raw.data.as_slice()).unwrap();

    let (collection_metadata, _cm_bump) = Pubkey::find_program_address(
        &[
            "metadata".as_bytes(),
            token_metadata_pid.as_ref(),
            data_only_config_acc.collection.as_ref(),
        ],
        &token_metadata_pid,
    );

    let (collection_master_edition, _cme_bump) = Pubkey::find_program_address(
        &[
            "metadata".as_bytes(),
            token_metadata_pid.as_ref(),
            data_only_config_acc.collection.as_ref(),
            "edition".as_bytes(),
        ],
        &token_metadata_pid,
    );

    let (entity_creator, _ec_bump) =
        Pubkey::find_program_address(&["entity_creator".as_bytes(), dao.as_ref()], &HEM_PID);

    // get the sha256 hash of the entity_key
    let mut hasher = Sha256::new();
    hasher.update(entity_key);
    let hash = hasher.finalize();

    let (key_to_asset, _kta_bump) =
        Pubkey::find_program_address(&["key_to_asset".as_bytes(), dao.as_ref(), &hash], &HEM_PID);

    let (tree_authority, _ta_bump) =
        Pubkey::find_program_address(&[data_only_config_acc.merkle_tree.as_ref()], &BGUM_PID);

    let (data_only_escrow, _doe_bump) = Pubkey::find_program_address(
        &[
            "data_only_escrow".as_bytes(),
            data_only_config.key().as_ref(),
        ],
        &HEM_PID,
    );

    let (bubblegum_signer, _bs_bump) =
        Pubkey::find_program_address(&["collection_cpi".as_bytes()], &BGUM_PID);
    IssueDataOnlyEntityV0 {
        payer: program.payer(),
        ecc_verifier: Pubkey::from_str(ECC_VERIFIER).unwrap(),
        collection: data_only_config_acc.collection,
        collection_metadata,
        collection_master_edition,
        data_only_config,
        entity_creator,
        dao,
        key_to_asset,
        tree_authority,
        recipient: program.payer(),
        merkle_tree: data_only_config_acc.merkle_tree,
        data_only_escrow,
        bubblegum_signer,
        token_metadata_program: token_metadata_pid,
        log_wrapper: noop_pid,
        bubblegum_program: BGUM_PID,
        compression_program: compression_pid,
        system_program: system_program::id(),
    }
}

fn construct_onboard_iot_accounts(
    program: &Program,
    hnt_mint: Pubkey,
    entity_key: &Vec<u8>,
) -> OnboardDataOnlyIotHotspotV0 {
    let compression_program = Pubkey::from_str(COMPRESSION).unwrap();
    let iot_mint = Pubkey::from_str(IOT_MINT).unwrap();
    let dc_mint = Pubkey::from_str(DC_MINT).unwrap();

    let (dao, _dao_bump) =
        Pubkey::find_program_address(&["dao".as_bytes(), hnt_mint.as_ref()], &HEM_PID);
    let (sub_dao, _sd_bump) =
        Pubkey::find_program_address(&["sub_dao".as_bytes(), iot_mint.as_ref()], &HSD_PID);

    let (rewardable_entity_config, _rec_bump) = Pubkey::find_program_address(
        &[
            "rewardable_entity_config".as_bytes(),
            sub_dao.as_ref(),
            "IOT".as_bytes(),
        ],
        &HEM_PID,
    );

    let mut hasher = Sha256::new();
    hasher.update(entity_key);
    let hash = hasher.finalize();

    let (iot_info, _info_bump) = Pubkey::find_program_address(
        &[
            "iot_info".as_bytes(),
            rewardable_entity_config.key().as_ref(),
            &hash,
        ],
        &HEM_PID,
    );

    let (data_only_config, _data_only_bump) =
        Pubkey::find_program_address(&["data_only_config".as_bytes(), dao.as_ref()], &HEM_PID);

    let data_only_config_acc_raw = program.rpc().get_account(&data_only_config).unwrap();
    let data_only_config_acc =
        DataOnlyConfigV0::try_deserialize(&mut data_only_config_acc_raw.data.as_slice()).unwrap();

    let (key_to_asset, _kta_bump) =
        Pubkey::find_program_address(&["key_to_asset".as_bytes(), dao.as_ref(), &hash], &HEM_PID);

    let (dc, _dc_bump) =
        Pubkey::find_program_address(&["dc".as_bytes(), dc_mint.as_ref()], &DC_PID);

    OnboardDataOnlyIotHotspotV0 {
        payer: program.payer(),
        dc_fee_payer: program.payer(),
        iot_info,
        hotspot_owner: program.payer(),
        merkle_tree: data_only_config_acc.merkle_tree,
        dc_burner: get_associated_token_address(&program.payer(), &dc_mint),
        rewardable_entity_config,
        data_only_config,
        dao,
        key_to_asset,
        sub_dao,
        dc_mint,
        dc,
        compression_program,
        data_credits_program: DC_PID,
        token_program: Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap(),
        associated_token_program: spl_associated_token_account::id(),
        system_program: system_program::id(),
    }
}
async fn run() {
    // parse args
    let args = Args::parse();

    // load the solana paper wallet
    let anchor_client = Client::new_with_options(
        Cluster::Custom(
            args.url.clone(),
            args.url
                .clone()
                .replace("https", "wss")
                .replace("http", "ws"),
        ),
        Rc::new(read_keypair_file(args.keypair).unwrap()),
        CommitmentConfig::confirmed(),
    );

    let program = anchor_client
        .program(Pubkey::from_str("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR").unwrap());

    let entity_key = bs58::decode(args.entity_key).into_vec().unwrap();

    println!("Issuing entity");
    // check if entity has already been issued
    let mut hasher = Sha256::new();
    hasher.update(entity_key.clone());
    let hash = hasher.finalize();

    // check if entity has been issued by checking key_to_asset exists
    let (dao, _dao_bump) = Pubkey::find_program_address(
        &[
            "dao".as_bytes(),
            Pubkey::from_str(HNT_MINT).unwrap().as_ref(),
        ],
        &HEM_PID,
    );
    let (key_to_asset, _kta_bump) =
        Pubkey::find_program_address(&["key_to_asset".as_bytes(), dao.as_ref(), &hash], &HEM_PID);

    let kta = program.rpc().get_account(&key_to_asset).unwrap();
    // If the entity has not been issued, issue it. Otherwise, onboard it.
    if kta.data.is_empty() {
        // construct the issue entity transaction
        let issue_entity_accounts = construct_issue_entity_accounts(
            &program,
            Pubkey::from_str(HNT_MINT).unwrap(),
            &entity_key,
        );
        let compute_ix = ComputeBudgetInstruction::set_compute_unit_limit(200000);
        let tx = program
            .request()
            .args(helium_entity_manager::instruction::IssueDataOnlyEntityV0 {
                args: IssueDataOnlyEntityArgsV0 {
                    entity_key: entity_key.clone(),
                },
            })
            .accounts(issue_entity_accounts)
            .instruction(compute_ix)
            .signed_transaction()
            .unwrap();

        let serialized_tx = hex::encode(&bincode::serialize(&tx).unwrap());
        // verify the base64 transaction with the ecc-sig-verifier
        let url = env::var("ECC_VERIFIER_URL").expect("ECC_VERIFIER_URL must be set");

        let req_client = reqwest::Client::new();
        let response = req_client
            .post(url)
            .body(
                serde_json::to_string(&VerifyRequest {
                    transaction: &serialized_tx,
                    msg: &args.transaction,
                    signature: &args.signature,
                })
                .unwrap(),
            )
            .send()
            .await
            .unwrap()
            .json::<VerifyResponse>()
            .await
            .unwrap();
        let raw_signed_tx = hex::decode(response.transaction).unwrap();
        let signed_tx: Transaction = bincode::deserialize(&raw_signed_tx).unwrap();

        program
            .rpc()
            .send_and_confirm_transaction_with_spinner(&signed_tx)
            .unwrap();
    } else {
        println!("Entity already issued");
    }

    println!("Onboarding hotspot");

    let kta_raw = program.rpc().get_account(&key_to_asset).unwrap();
    let kta_acc = KeyToAssetV0::try_deserialize(&mut kta_raw.data.as_slice()).unwrap();
    let issue_entity_accounts =
        construct_onboard_iot_accounts(&program, Pubkey::from_str(HNT_MINT).unwrap(), &entity_key);
    let compute_ix = ComputeBudgetInstruction::set_compute_unit_limit(200000);

    let req_client = reqwest::Client::new();
    let get_asset_response = req_client
        .post(program.rpc().url())
        .body(format!(
            "{{
                jsonrpc: '2.0',
                method: 'getAsset',
                id: 'rpd-op-123',
                params: {{ id: {} }},
                headers: {{
                  'Cache-Control': 'no-cache',
                  Pragma: 'no-cache',
                  Expires: '0',
                }},
              }}",
            kta_acc.asset.to_string(),
        ))
        .send()
        .await
        .unwrap()
        .json::<serde_json::Value>()
        .await
        .unwrap();
    let data_hash: [u8; 32] = bs58::decode(
        get_asset_response.as_object().unwrap()["result"]["compression"]["data_hash"]
            .as_str()
            .unwrap(),
    )
    .into_vec()
    .unwrap()
    .as_slice()
    .try_into()
    .unwrap();
    let creator_hash: [u8; 32] = bs58::decode(
        get_asset_response.as_object().unwrap()["result"]["compression"]["creator_hash"]
            .as_str()
            .unwrap(),
    )
    .into_vec()
    .unwrap()
    .as_slice()
    .try_into()
    .unwrap();
    let leaf_id = get_asset_response.as_object().unwrap()["result"]["compression"]["leaf_id"]
        .as_u64()
        .unwrap();

    let req_client = reqwest::Client::new();
    let get_asset_proof_response = req_client
        .post(program.rpc().url())
        .body(format!(
            "{{
                jsonrpc: '2.0',
                method: 'getAssetProof',
                id: 'rpd-op-123',
                params: {{ id: {} }},
                headers: {{
                  'Cache-Control': 'no-cache',
                  Pragma: 'no-cache',
                  Expires: '0',
                }},
              }}",
            kta_acc.asset.to_string(),
        ))
        .send()
        .await
        .unwrap()
        .json::<serde_json::Value>()
        .await
        .unwrap();

    let root: [u8; 32] = Pubkey::from_str(
        get_asset_proof_response.as_object().unwrap()["result"]["proof"]
            .as_str()
            .unwrap(),
    )
    .unwrap()
    .to_bytes();
    let tx = program
        .request()
        .args(
            helium_entity_manager::instruction::OnboardDataOnlyIotHotspotV0 {
                args: OnboardDataOnlyIotHotspotArgsV0 {
                    data_hash,
                    creator_hash,
                    root,
                    index: leaf_id.try_into().unwrap(),
                    location: args.location,
                    elevation: args.elevation,
                    gain: args.gain,
                },
            },
        )
        .accounts(issue_entity_accounts)
        .send()
        .unwrap();
}

#[tokio::main]
async fn main() {
    run().await;
}
