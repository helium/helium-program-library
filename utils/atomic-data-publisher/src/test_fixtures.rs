use helium_crypto::{KeyTag, Keypair, PublicKeyBinary};
use serde_json::{json, Value};

use crate::config::{DatabaseConfig, PollingJob};
use crate::database::ChangeRecord;

pub fn test_keypair() -> Keypair {
    let key_tag = KeyTag {
        network: helium_crypto::Network::MainNet,
        key_type: helium_crypto::KeyType::Ed25519,
    };
    Keypair::generate_from_entropy(
        key_tag,
        &[
            42, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
            23, 24, 25, 26, 27, 28, 29, 30, 31,
        ],
    )
    .expect("test keypair generation should succeed")
}

/// Produce hex-encoded entity key bytes matching what PostgreSQL
/// `encode(entity_key, 'hex')` returns. The DB stores the full
/// base58check-compatible binary (version byte + key tag + key
/// bytes + 4-byte checksum).
pub fn test_entity_key_hex(keypair: &Keypair) -> String {
    let pk_binary = PublicKeyBinary::from(keypair.public_key().clone());
    let b58check_str = pk_binary.to_string();
    let raw_bytes = bs58::decode(&b58check_str)
        .into_vec()
        .expect("valid base58check string");
    hex::encode(raw_bytes)
}

pub fn test_solana_pubkey() -> String {
    test_solana_pubkey_n(1)
}

pub fn test_solana_pubkey_n(n: u8) -> String {
    let bytes = [n; 32];
    bs58::encode(bytes).into_string()
}

pub fn make_change_record(
    job_name: &str,
    query_name: &str,
    target_block: u64,
    atomic_data: Value,
) -> ChangeRecord {
    ChangeRecord {
        job_name: job_name.to_string(),
        query_name: query_name.to_string(),
        target_block,
        atomic_data,
    }
}

pub fn mobile_hotspot_json(
    pub_key_hex: &str,
    asset: &str,
    device_type: &str,
    deployment_info: Value,
    block: u64,
) -> Value {
    json!({
        "pub_key": pub_key_hex,
        "asset": asset,
        "device_type": device_type,
        "deployment_info": deployment_info,
        "block": block,
    })
}

pub fn iot_hotspot_json(
    pub_key_hex: &str,
    asset: &str,
    block: u64,
    location: Option<&str>,
    elevation: Option<u32>,
    gain: Option<u32>,
    is_full_hotspot: bool,
) -> Value {
    let mut data = json!({
        "pub_key": pub_key_hex,
        "asset": asset,
        "block": block,
        "is_full_hotspot": is_full_hotspot,
    });
    if let Some(loc) = location {
        data["location"] = json!(loc);
    }
    if let Some(elev) = elevation {
        data["elevation"] = json!(elev);
    }
    if let Some(g) = gain {
        data["gain"] = json!(g);
    }
    data
}

pub fn entity_ownership_json(
    pub_key_hex: &str,
    asset: &str,
    owner: &str,
    owner_type: &str,
    block: u64,
) -> Value {
    json!({
        "pub_key": pub_key_hex,
        "asset": asset,
        "owner": owner,
        "owner_type": owner_type,
        "block": block,
    })
}

pub fn reward_destination_direct_json(
    pub_key_hex: &str,
    asset: &str,
    recipient: &str,
    block: u64,
) -> Value {
    json!({
        "pub_key": pub_key_hex,
        "asset": asset,
        "rewards_recipient": recipient,
        "block": block,
    })
}

pub fn reward_destination_fanout_json(
    pub_key_hex: &str,
    asset: &str,
    fanout_addr: &str,
    recipients: Vec<Value>,
    block: u64,
) -> Value {
    json!({
        "pub_key": pub_key_hex,
        "asset": asset,
        "rewards_split": {
            "pub_key": fanout_addr,
            "schedule": "daily",
            "total_shares": 10000,
            "recipients": recipients,
        },
        "block": block,
    })
}

pub fn valid_test_db_config() -> DatabaseConfig {
    DatabaseConfig {
        host: "localhost".to_string(),
        port: 5432,
        username: "test_user".to_string(),
        password: "test_pass".to_string(),
        database_name: "test_db".to_string(),
        max_connections: 10,
        min_connections: 2,
        acquire_timeout_seconds: 30,
        idle_timeout_seconds: 300,
        max_lifetime_seconds: 600,
        required_tables: vec!["test_table".to_string()],
        ssl_mode: None,
        aws_region: None,
        statement_timeout_seconds: 300,
    }
}

pub fn make_polling_job(name: &str, query_name: &str, params: Value) -> PollingJob {
    PollingJob {
        name: name.to_string(),
        query_name: query_name.to_string(),
        parameters: params,
    }
}
