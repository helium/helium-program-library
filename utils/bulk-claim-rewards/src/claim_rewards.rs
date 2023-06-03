use anchor_client::Program;
use anchor_lang::AccountDeserialize;
use anyhow::anyhow;
use bs58;
use circuit_breaker::ID as CB_PID;
use futures::stream::{StreamExt, TryStreamExt};
use helium_entity_manager::ID as HEM_PID;
use hpl_utils::send_and_confirm_messages_with_spinner;
use lazy_distributor::{
    accounts::{
        DistributeCompressionRewardsV0, DistributeRewardsCommonV0, InitializeCompressionRecipientV0,
    },
    DistributeCompressionRewardsArgsV0, InitializeCompressionRecipientArgsV0, LazyDistributorV0,
    RecipientV0, ID as LD_PID,
};
use rewards_oracle::{
    accounts::SetCurrentRewardsWrapperV0, SetCurrentRewardsWrapperArgsV0, ID as RO_PID,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map};
use sha2::{Digest, Sha256};
use solana_client::tpu_client::{TpuClient, TpuClientConfig};
use solana_program::{
    hash::Hash,
    instruction::{AccountMeta, Instruction},
    system_program,
};
use solana_sdk::{pubkey::Pubkey, signature::Keypair};
use solana_sdk::{signer::Signer, transaction::Transaction};
use spl_associated_token_account::get_associated_token_address;
use std::str::FromStr;

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse<T> {
    jsonrpc: String,
    result: Option<T>,
    error: Option<JsonRpcError>,
    id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OracleBulkRewardRequest {
    #[serde(rename = "entityKeys")]
    entity_keys: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OracleBulkRewardResponse {
    #[serde(rename = "currentRewards")]
    current_rewards: Map<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OracleBulkSignRequest {
    transactions: Vec<Vec<u8>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TxBuffer {
    r#type: String,
    data: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OracleBulkSignResponse {
    success: bool,
    transactions: Vec<TxBuffer>,
}

#[derive(Clone)]
struct Hotspot {
    id: Pubkey,
    entity_key: String,
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    leaf_id: u64,
    merkle_tree: Pubkey,
    recipient: Pubkey,
    recipient_acc: Option<Option<RecipientV0>>,
}

const COMPRESSION: &str = "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK";

/// Claims all hotspot rewards for a given hotspot_owner. The payer set on the program object pays for the transactions
pub async fn claim_rewards(
    ld_program: &Program,
    ro_program: &Program,
    payer: &Keypair,
    hotspot_owner: Pubkey,
    rewards_mint: Pubkey,
    dao: Pubkey,
    batch_size: usize,
    init_recipients: bool,
) -> Result<(), anyhow::Error> {
    let mut total = 0;
    let tpu_client = TpuClient::new(
        ld_program.rpc().into(),
        &ld_program
            .rpc()
            .url()
            .replace("https", "wss")
            .replace("http", "ws"),
        TpuClientConfig::default(),
    )
    .unwrap();
    let (entity_creator, _ec_bump) =
        Pubkey::find_program_address(&["entity_creator".as_bytes(), dao.as_ref()], &HEM_PID);
    let (lazy_distributor, _ld_bump) = Pubkey::find_program_address(
        &["lazy_distributor".as_bytes(), rewards_mint.as_ref()],
        &LD_PID,
    );

    let ld_acc = ld_program.account::<LazyDistributorV0>(lazy_distributor)?;
    let mut counter = 1;
    loop {
        // get all nfts owned by user from the das
        let req_client = reqwest::Client::new();
        let get_asset_response = req_client
            .post(ld_program.rpc().url())
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
            .header("Expires", "0")
            .json(&JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                method: "getAssetsByOwner".to_string(),
                params: json!({
                    "ownerAddress": hotspot_owner.to_string(),
                    "page": counter,
                    "limit": batch_size,
                }),
                id: "rpd-op-123".to_string(),
            })
            .send()
            .await
            .map_err(|e| anyhow!("Failed to get asset: {e}"))?
            .json::<JsonRpcResponse<serde_json::Value>>()
            .await
            .map_err(|e| anyhow!("Failed to parse asset response: {e}"))?;
        let result = get_asset_response.result.unwrap();
        let assets = result
            .as_object()
            .unwrap()
            .get("items")
            .unwrap()
            .as_array()
            .unwrap();
        if assets.len() == 0 {
            break;
        }

        // filter out assets that are not created by entityCreator
        println!("Found {} assets", assets.len());
        let parsed_hotspots: Result<Vec<Hotspot>, anyhow::Error> = assets
            .iter()
            .filter(|a| {
                let creators = a
                    .as_object()
                    .unwrap()
                    .get("creators")
                    .unwrap()
                    .as_array()
                    .unwrap();
                creators[0]
                    .as_object()
                    .unwrap()
                    .get("address")
                    .unwrap()
                    .as_str()
                    .unwrap()
                    == entity_creator.to_string()
            })
            .map(|h| {
                let compression_info = h
                    .as_object()
                    .unwrap()
                    .get("compression")
                    .unwrap()
                    .as_object()
                    .unwrap();
                let id =
                    Pubkey::from_str(h.as_object().unwrap().get("id").unwrap().as_str().unwrap())
                        .unwrap();
                let (recipient, _rcp_bump) = Pubkey::find_program_address(
                    &[
                        "recipient".as_bytes(),
                        lazy_distributor.as_ref(),
                        id.as_ref(),
                    ],
                    &LD_PID,
                );
                Ok(Hotspot {
                    id,
                    entity_key: h
                        .as_object()
                        .unwrap()
                        .get("content")
                        .unwrap()
                        .as_object()
                        .unwrap()
                        .get("json_uri")
                        .unwrap()
                        .as_str()
                        .unwrap()
                        .split("/")
                        .collect::<Vec<_>>()
                        .last()
                        .unwrap()
                        .to_string(),
                    data_hash: bs58::decode(
                        compression_info.get("data_hash").unwrap().as_str().unwrap(),
                    )
                    .into_vec()
                    .unwrap()
                    .as_slice()
                    .try_into()
                    .unwrap(),
                    creator_hash: bs58::decode(
                        compression_info
                            .get("creator_hash")
                            .unwrap()
                            .as_str()
                            .unwrap(),
                    )
                    .into_vec()
                    .unwrap()
                    .as_slice()
                    .try_into()
                    .unwrap(),
                    leaf_id: compression_info.get("leaf_id").unwrap().as_u64().unwrap(),
                    merkle_tree: Pubkey::from_str(
                        compression_info.get("tree").unwrap().as_str().unwrap(),
                    )
                    .unwrap(),
                    recipient,
                    recipient_acc: None,
                })
            })
            .collect();
        let hotspots = parsed_hotspots.map_err(|e: anyhow::Error| {
            println!("Hotspots: {:?}", assets);
            anyhow!("Failed to parse hotspots: {e}")
        })?;

        println!("Hotspots: {:?}", hotspots.len());
        if hotspots.len() == 0 {
            counter += 1;
            continue;
        }
        // get all the rewards for each nft
        println!("Fetching rewards");
        let rewards = get_hotspot_rewards(&hotspots, &ld_acc)
            .await
            .map_err(|e| anyhow!("Failed to get hotspot rewards for hotspots: {:?}", e))?;
        println!("Fetching on-chain accounts");
        let recipient_accs = ld_program
            .rpc()
            .get_multiple_accounts(
                hotspots
                    .iter()
                    .map(|h| h.recipient)
                    .collect::<Vec<_>>()
                    .as_slice(),
            )
            .map_err(|e| anyhow!("Failed to fetch on-chain recipients: {:?}", e))?;

        let recipients = recipient_accs
            .iter()
            .map(|x| match x {
                Some(acc) => {
                    let recipient = RecipientV0::try_deserialize(&mut acc.data.as_slice())
                        .map_err(|e| anyhow!("Failed to deserialize recipient: {:?}", e))
                        .unwrap();
                    Some(recipient)
                }
                None => None,
            })
            .collect::<Vec<_>>();

        let hotspots = hotspots
            .iter()
            .zip(recipients.iter())
            .map(|(h, r)| {
                let mut h = h.clone();
                h.recipient_acc = Some(r.clone());
                h
            })
            .collect::<Vec<_>>();

        // filter out hotspots where all oracles are showing 0 rewards or the rewards are already claimed
        let hotspots_to_claim: Vec<Hotspot> = hotspots
            .iter()
            .cloned()
            .filter(|h| {
                let num_oracles_with_rewards = rewards
                    .iter()
                    .filter(|r| {
                        let reward = r.get(&h.entity_key);

                        let recipient_acc = h.recipient_acc.clone().unwrap_or(None);
                        let claimed_rewards = match recipient_acc {
                            Some(acc) => acc.total_rewards,
                            None => 0,
                        };
                        let no_rewards = reward.is_none()
                            || reward.unwrap().as_str().unwrap() == "0".to_string();
                        let already_claimed = reward.unwrap_or(&json!("")).as_str().unwrap()
                            == claimed_rewards.to_string();
                        return no_rewards || already_claimed;
                    })
                    .count();
                return num_oracles_with_rewards == 0;
            })
            .collect::<Vec<_>>();

        println!("Hotspots to claim: {:?}", hotspots_to_claim.len());
        if hotspots_to_claim.len() == 0 {
            counter += 1;
            continue;
        }

        println!("Fetching compression proofs");
        let proofs_stream = futures::stream::iter(hotspots_to_claim.clone().into_iter())
            .map(|hotspot| get_proof(ro_program.rpc().url(), hotspot.id))
            .buffered(5);
        let proofs = proofs_stream
            .try_collect::<Vec<_>>()
            .await
            .map_err(|e| anyhow!("Failed to get proofs: {e}"))?
            .iter()
            .map(|p| {
                let root: [u8; 32] =
                    Pubkey::from_str(p.as_object().unwrap()["root"].as_str().unwrap())
                        .unwrap()
                        .to_bytes();
                let proof = p.as_object().unwrap()["proof"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|p| AccountMeta {
                        pubkey: Pubkey::from_str(p.as_str().unwrap()).unwrap(),
                        is_signer: false,
                        is_writable: false,
                    })
                    .collect::<Vec<_>>();
                (root, proof)
            })
            .collect::<Vec<_>>();

        anyhow::ensure!(
            proofs.len() == hotspots_to_claim.len(),
            "Proofs and hotspots are not the same length"
        );
        if init_recipients {
            println!("Initializing on chain structs");
            let blockhash = ld_program.rpc().get_latest_blockhash()?;
            let stream =
                futures::stream::iter(hotspots_to_claim.clone().into_iter().zip(proofs.iter()))
                    .map(|(hotspot, (root, proof))| {
                        check_and_init_recipient(
                            ld_program,
                            lazy_distributor,
                            hotspot.clone(),
                            hotspot_owner,
                            root,
                            proof,
                            payer,
                            blockhash,
                        )
                    })
                    .buffer_unordered(5);

            let init_recipient_txs = stream.try_collect::<Vec<_>>().await.unwrap();

            send_and_confirm_messages_with_spinner(
                ld_program.rpc().into(),
                &tpu_client,
                &init_recipient_txs
                    .iter()
                    .filter(|tx| tx.clone().is_some())
                    .map(|tx| bincode::serialize(&tx.clone().unwrap()).unwrap())
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        }

        println!("Creating distribute rewards transactions");
        // construct the set and distribute rewards instructions
        let blockhash = ld_program.rpc().get_latest_blockhash()?;
        let initial_txs_res: Result<Vec<Transaction>, anyhow::Error> = hotspots_to_claim
            .clone()
            .into_iter()
            .zip(proofs.iter())
            .map(|(hotspot, (root, proof))| {
                process_hotspot(
                    ro_program,
                    ld_program,
                    hotspot.clone(),
                    root,
                    proof,
                    &rewards,
                    hotspot_owner,
                    payer,
                    rewards_mint,
                    dao,
                    lazy_distributor,
                    ld_acc.clone(),
                    blockhash,
                )
            })
            .collect();
        let initial_txs =
            initial_txs_res.map_err(|e| anyhow!("Failed to generate hotspot transactions: {e}"))?;

        let mut serialized_txs = initial_txs
            .iter()
            .map(|tx| bincode::serialize(&tx).unwrap())
            .collect::<Vec<_>>();

        // bulk sign the whole batch from oracles
        println!("Signing transactions from oracles");
        let req_client = reqwest::Client::new();
        for oracle in &ld_acc.oracles.clone() {
            let bulk_sign_response = req_client
                .post(format!("{}/bulk-sign", oracle.url))
                .json(&OracleBulkSignRequest {
                    transactions: serialized_txs.clone(),
                })
                .send()
                .await
                .map_err(|e| anyhow!("Oracle failed to sign transactions: {e}"))?
                .json::<OracleBulkSignResponse>()
                .await
                .map_err(|e| anyhow!("Failed to parse oracle signatures response: {e}"))?;

            serialized_txs = bulk_sign_response
                .transactions
                .iter()
                .map(|x| x.data.clone())
                .collect();
        }

        // check that all the txs are the same as before
        let final_txs_res: Result<Vec<Transaction>, anyhow::Error> = serialized_txs
            .iter()
            .map(|tx| {
                bincode::deserialize::<Transaction>(tx).map_err(|e| {
                    anyhow!(
                        "Failed to deserialize transaction from oracle: {:?} {:?}",
                        tx,
                        e
                    )
                })
            })
            .collect();
        let final_txs =
            final_txs_res.map_err(|e| anyhow!("Failed to deserialize transactions: {e}"))?;

        assert_txs_are_same(&initial_txs, &final_txs).unwrap();
        println!("Final txs to submit: {:?}", final_txs.len());
        total += final_txs.len();

        // submit the batch of txs
        send_and_confirm_messages_with_spinner(
            ld_program.rpc().into(),
            &tpu_client,
            &serialized_txs,
        )
        .unwrap();

        counter += 1;
        println!("Total claimed so far: {}", total);
    }
    Ok(())
}

async fn check_and_init_recipient(
    ld_program: &Program,
    lazy_distributor: Pubkey,
    hotspot: Hotspot,
    hotspot_owner: Pubkey,
    root: &[u8; 32],
    proof: &Vec<AccountMeta>,
    payer: &Keypair,
    blockhash: Hash,
) -> Result<Option<Transaction>, anyhow::Error> {
    let compression_program = Pubkey::from_str(COMPRESSION).unwrap();

    if hotspot.recipient_acc.unwrap_or(None).is_none() {
        let mut init_recipient_ixs = ld_program
            .request()
            .args(
                lazy_distributor::instruction::InitializeCompressionRecipientV0 {
                    args: InitializeCompressionRecipientArgsV0 {
                        data_hash: hotspot.data_hash,
                        creator_hash: hotspot.creator_hash,
                        root: root.clone(),
                        index: hotspot.leaf_id.try_into().unwrap(),
                    },
                },
            )
            .accounts(InitializeCompressionRecipientV0 {
                payer: ld_program.payer(),
                lazy_distributor,
                recipient: hotspot.recipient,
                merkle_tree: hotspot.merkle_tree,
                owner: hotspot_owner,
                delegate: hotspot_owner,
                compression_program,
                system_program: system_program::id(),
            })
            .instructions()
            .map_err(|e| anyhow!("Failed to construct init recipient instruction: {e}"))?;

        init_recipient_ixs[0]
            .accounts
            .extend_from_slice(&proof.as_slice()[0..3]);
        let mut init_recipient_tx = Transaction::new_with_payer(
            &init_recipient_ixs.as_slice().clone(),
            Some(&payer.pubkey()),
        );

        init_recipient_tx
            .try_sign(&[payer], blockhash)
            .map_err(|e| anyhow!("Error while signing tx: {e}"))?;
        return Ok(Some(init_recipient_tx));
    }

    Ok(None)
}

async fn get_proof(rpc_url: String, id: Pubkey) -> Result<serde_json::Value, anyhow::Error> {
    let req_client = reqwest::Client::new();
    let get_asset_proof_response = req_client
        .post(rpc_url)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        .json(&JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "getAssetProof".to_string(),
            params: json!({
                "id": id.to_string(),
            }),
            id: "rpd-op-123".to_string(),
        })
        .send()
        .await
        .unwrap()
        .json::<JsonRpcResponse<serde_json::Value>>()
        .await
        .unwrap();
    Ok(get_asset_proof_response.result.unwrap())
}

fn process_hotspot(
    ro_program: &Program,
    ld_program: &Program,
    hotspot: Hotspot,
    root: &[u8; 32],
    proof: &Vec<AccountMeta>,
    rewards: &Vec<Map<String, serde_json::Value>>,
    hotspot_owner: Pubkey,
    payer: &Keypair,
    rewards_mint: Pubkey,
    dao: Pubkey,
    lazy_distributor: Pubkey,
    ld_acc: LazyDistributorV0,
    blockhash: Hash,
) -> Result<Transaction, anyhow::Error> {
    let mut ixs: Vec<Instruction> = vec![];

    for (oracle_index, reward) in rewards.clone().iter().enumerate() {
        let set_reward_accounts = construct_set_rewards_accounts(
            dao,
            hotspot.id,
            ld_acc.oracles[oracle_index].oracle.clone(),
            lazy_distributor,
            hotspot.entity_key.clone(),
        )
        .map_err(|e| anyhow!("Failed to construct set rewards accounts: {e}"))?;

        let set_reward_ix = &ro_program
            .request()
            .args(rewards_oracle::instruction::SetCurrentRewardsWrapperV0 {
                args: SetCurrentRewardsWrapperArgsV0 {
                    entity_key: bs58::decode(&hotspot.entity_key)
                        .into_vec()
                        .map_err(|e| anyhow!("Failed to decode entity key: {e}"))?,
                    oracle_index: oracle_index as u16,
                    current_rewards: reward
                        .get(&hotspot.entity_key)
                        .ok_or(anyhow!(format!(
                            "Couldn't find reward for entity key: {}",
                            hotspot.entity_key
                        )))?
                        .as_str()
                        .unwrap()
                        .parse::<u64>()
                        .map_err(|e| anyhow!("Failed to parse reward: {e}"))?,
                },
            })
            .accounts(set_reward_accounts)
            .instructions()
            .map_err(|e| anyhow!("Failed to construct set reward instruction: {e}"))?[0];

        ixs.push(set_reward_ix.clone());
    }

    let distribute_accounts = construct_distribute_rewards_accounts(
        ld_program,
        rewards_mint,
        hotspot_owner,
        hotspot.id,
        hotspot.merkle_tree,
        lazy_distributor,
        ld_acc.clone(),
    )
    .map_err(|e| anyhow!("Failed to construct distribute rewards accounts: {e}"))?;

    let mut distribute_rewards_ixs = ld_program
        .request()
        .args(
            lazy_distributor::instruction::DistributeCompressionRewardsV0 {
                args: DistributeCompressionRewardsArgsV0 {
                    data_hash: hotspot.data_hash,
                    creator_hash: hotspot.creator_hash,
                    root: root.clone(),
                    index: hotspot.leaf_id.try_into().unwrap(),
                },
            },
        )
        .accounts(distribute_accounts)
        .instructions()
        .map_err(|e| anyhow!("Failed to construct set reward instruction: {e}"))?;

    distribute_rewards_ixs[0]
        .accounts
        .extend_from_slice(&proof.as_slice()[0..3]);
    ixs.push(distribute_rewards_ixs[0].clone());
    let mut tx = Transaction::new_with_payer(&ixs, Some(&payer.pubkey()));

    tx.try_partial_sign(&[payer], blockhash)
        .map_err(|e| anyhow!("Error while signing tx: {e}"))?;

    Ok(tx)
}

fn assert_txs_are_same(
    initial_txs: &Vec<Transaction>,
    final_txs: &Vec<Transaction>,
) -> Result<(), anyhow::Error> {
    anyhow::ensure!(
        initial_txs.len() == final_txs.len(),
        "Txs are not the same length"
    );
    for (initial_tx, final_tx) in initial_txs.iter().zip(final_txs.iter()) {
        let initial_acc_keys = &initial_tx.message.account_keys;
        let final_acc_keys = &final_tx.message.account_keys;
        anyhow::ensure!(
            initial_acc_keys.len() == final_acc_keys.len(),
            "Account keys are not the same length"
        );
        for (initial_acc_key, final_acc_key) in initial_acc_keys.iter().zip(final_acc_keys.iter()) {
            anyhow::ensure!(
                initial_acc_key == final_acc_key,
                "Account keys are not the same"
            );
        }
        let initial_ixs = &initial_tx.message.instructions;
        let final_ixs = &final_tx.message.instructions;
        anyhow::ensure!(
            initial_ixs.len() == final_ixs.len(),
            "Instructions are not the same length"
        );
        for (initial_ix, final_ix) in initial_ixs.iter().zip(final_ixs.iter()) {
            anyhow::ensure!(
                initial_ix.program_id_index == final_ix.program_id_index,
                "Program id is not the same"
            );
            anyhow::ensure!(initial_ix.data == final_ix.data, "Ix data is not the same");
            anyhow::ensure!(
                initial_ix.accounts.len() == final_ix.accounts.len(),
                "Accounts are not the same length"
            );
            anyhow::ensure!(
                initial_ix.accounts == final_ix.accounts,
                "Accounts are not the same"
            );
        }
    }
    Ok(())
}

async fn hotspot_rewards_request(
    entity_keys: Vec<String>,
    oracle_url: String,
) -> Result<Map<String, serde_json::Value>, anyhow::Error> {
    let req_client = reqwest::Client::new();
    let oracle_rewards_response = req_client
        .post(format!("{}/bulk-rewards", oracle_url))
        .json(&OracleBulkRewardRequest { entity_keys })
        .send()
        .await
        .map_err(|e| anyhow!("Failed to get hotspot rewards: {e}"))?
        .json::<OracleBulkRewardResponse>()
        .await
        .map_err(|e| anyhow!("Failed to parse get rewards response: {e}"))?;
    Ok(oracle_rewards_response.current_rewards)
}

async fn get_hotspot_rewards(
    hotspots: &Vec<Hotspot>,
    ld_acc: &LazyDistributorV0,
) -> Result<Vec<Map<String, serde_json::Value>>, anyhow::Error> {
    let entity_keys = hotspots
        .iter()
        .map(|h| h.entity_key.clone())
        .collect::<Vec<_>>();

    let mut results: Vec<Map<String, serde_json::Value>> = vec![];
    for oracle in ld_acc.oracles.clone() {
        let rewards = hotspot_rewards_request(entity_keys.clone(), oracle.url).await;
        results.push(rewards.map_err(|e| anyhow!("Failed to get hotspot rewards: {e}"))?);
    }

    Ok(results)
}

fn construct_set_rewards_accounts(
    dao: Pubkey,
    asset_id: Pubkey,
    oracle: Pubkey,
    lazy_distributor: Pubkey,
    entity_key: String,
) -> Result<SetCurrentRewardsWrapperV0, anyhow::Error> {
    let (recipient, _rcp_bump) = Pubkey::find_program_address(
        &[
            "recipient".as_bytes(),
            lazy_distributor.as_ref(),
            asset_id.as_ref(),
        ],
        &LD_PID,
    );

    let hash = Sha256::digest(bs58::decode(entity_key.clone()).into_vec().unwrap());

    let (key_to_asset, _kta_bump) =
        Pubkey::find_program_address(&["key_to_asset".as_bytes(), dao.as_ref(), &hash], &HEM_PID);

    let (oracle_signer, _os_bump) =
        Pubkey::find_program_address(&["oracle_signer".as_bytes()], &RO_PID);

    Ok(SetCurrentRewardsWrapperV0 {
        oracle,
        lazy_distributor,
        recipient,
        key_to_asset,
        oracle_signer,
        lazy_distributor_program: LD_PID,
        system_program: system_program::id(),
    })
}

fn construct_distribute_rewards_accounts(
    ld_program: &Program,
    rewards_mint: Pubkey,
    hotspot_owner: Pubkey,
    asset_id: Pubkey,
    merkle_tree: Pubkey,
    lazy_distributor: Pubkey,
    ld_acc: LazyDistributorV0,
) -> Result<DistributeCompressionRewardsV0, anyhow::Error> {
    let compression_program = Pubkey::from_str(COMPRESSION).unwrap();

    let (recipient, _rcp_bump) = Pubkey::find_program_address(
        &[
            "recipient".as_bytes(),
            lazy_distributor.as_ref(),
            asset_id.as_ref(),
        ],
        &LD_PID,
    );

    let (circuit_breaker, _cb_bump) = Pubkey::find_program_address(
        &[
            "account_windowed_breaker".as_bytes(),
            ld_acc.rewards_escrow.as_ref(),
        ],
        &CB_PID,
    );

    Ok(DistributeCompressionRewardsV0 {
        common: DistributeRewardsCommonV0 {
            payer: ld_program.payer(),
            lazy_distributor,
            recipient,
            rewards_mint,
            rewards_escrow: ld_acc.rewards_escrow,
            circuit_breaker,
            owner: hotspot_owner,
            destination_account: get_associated_token_address(&hotspot_owner, &rewards_mint),
            associated_token_program: spl_associated_token_account::id(),
            circuit_breaker_program: CB_PID,
            system_program: system_program::id(),
            token_program: anchor_spl::token::ID,
        },
        merkle_tree,
        compression_program,
        token_program: anchor_spl::token::ID,
    })
}
