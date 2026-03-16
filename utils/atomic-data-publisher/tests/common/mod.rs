#![allow(clippy::too_many_arguments)]

use serde_json::Value;
use sqlx::{PgPool, Row};

pub const LAZY_DISTRIBUTOR: &str = "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq";
pub const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";

const OWNERSHIP_SQL: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/src/sql/construct_entity_ownership_changes.sql"
));

const REWARD_SQL: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/src/sql/construct_entity_reward_destination_changes.sql"
));

const HOTSPOT_SQL: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/src/sql/construct_atomic_hotspots.sql"
));

// --- Seed functions ---

pub async fn seed_key_to_asset(pool: &PgPool, address: &str, entity_key: &[u8], asset: &str) {
    seed_key_to_asset_with_serialization(pool, address, entity_key, asset, "\"b58\"").await;
}

pub async fn seed_key_to_asset_with_serialization(
    pool: &PgPool,
    address: &str,
    entity_key: &[u8],
    asset: &str,
    key_serialization: &str,
) {
    sqlx::query(
        "INSERT INTO key_to_assets (address, entity_key, asset, key_serialization) VALUES ($1, $2, $3, $4::jsonb)",
    )
    .bind(address)
    .bind(entity_key)
    .bind(asset)
    .bind(key_serialization)
    .execute(pool)
    .await
    .expect("seed key_to_asset");
}

pub async fn seed_asset_owner(pool: &PgPool, asset: &str, owner: &str, last_block: i64) {
    sqlx::query(
        "INSERT INTO asset_owners (asset, owner, last_block) VALUES ($1, $2, $3)",
    )
    .bind(asset)
    .bind(owner)
    .bind(last_block)
    .execute(pool)
    .await
    .expect("seed asset_owner");
}

pub async fn seed_welcome_pack(pool: &PgPool, address: &str, owner: &str) {
    sqlx::query("INSERT INTO welcome_packs (address, owner) VALUES ($1, $2)")
        .bind(address)
        .bind(owner)
        .execute(pool)
        .await
        .expect("seed welcome_pack");
}

pub async fn seed_iot_hotspot(
    pool: &PgPool,
    address: &str,
    asset: &str,
    last_block: i64,
    location: Option<&str>,
    elevation: Option<i32>,
    gain: Option<i32>,
    is_full_hotspot: bool,
) {
    sqlx::query(
        "INSERT INTO iot_hotspot_infos \
         (address, asset, last_block, location, elevation, gain, is_full_hotspot) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(address)
    .bind(asset)
    .bind(last_block)
    .bind(location)
    .bind(elevation)
    .bind(gain)
    .bind(is_full_hotspot)
    .execute(pool)
    .await
    .expect("seed iot_hotspot");
}

pub async fn seed_mobile_hotspot(
    pool: &PgPool,
    address: &str,
    asset: &str,
    last_block: i64,
    location: Option<&str>,
    device_type: &str,
    is_full_hotspot: bool,
    deployment_info: Option<Value>,
) {
    sqlx::query(
        "INSERT INTO mobile_hotspot_infos \
         (address, asset, last_block, location, device_type, is_full_hotspot, deployment_info) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(address)
    .bind(asset)
    .bind(last_block)
    .bind(location)
    .bind(device_type)
    .bind(is_full_hotspot)
    .bind(deployment_info)
    .execute(pool)
    .await
    .expect("seed mobile_hotspot");
}

pub async fn seed_recipient(
    pool: &PgPool,
    address: &str,
    lazy_distributor: &str,
    asset: &str,
    destination: &str,
    last_block: i64,
) {
    sqlx::query(
        "INSERT INTO recipients \
         (address, lazy_distributor, asset, destination, last_block) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(address)
    .bind(lazy_distributor)
    .bind(asset)
    .bind(destination)
    .bind(last_block)
    .execute(pool)
    .await
    .expect("seed recipient");
}

pub async fn seed_mini_fanout(
    pool: &PgPool,
    address: &str,
    owner: &str,
    schedule: &str,
    shares: &[Value],
    last_block: i64,
) {
    sqlx::query(
        "INSERT INTO mini_fanouts (address, owner, schedule, shares, last_block) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(address)
    .bind(owner)
    .bind(schedule)
    .bind(shares)
    .bind(last_block)
    .execute(pool)
    .await
    .expect("seed mini_fanout");
}

// --- Query runners ---

pub async fn run_ownership_query(
    pool: &PgPool,
    last_processed_block: i64,
    max_block: i64,
) -> Vec<Value> {
    sqlx::query(OWNERSHIP_SQL)
        .bind(last_processed_block)
        .bind(max_block)
        .fetch_all(pool)
        .await
        .expect("run ownership query")
        .into_iter()
        .map(|row| row.get::<Value, _>("atomic_data"))
        .collect()
}

pub async fn run_reward_query(
    pool: &PgPool,
    last_processed_block: i64,
    max_block: i64,
) -> Vec<Value> {
    sqlx::query(REWARD_SQL)
        .bind(last_processed_block)
        .bind(max_block)
        .fetch_all(pool)
        .await
        .expect("run reward query")
        .into_iter()
        .map(|row| row.get::<Value, _>("atomic_data"))
        .collect()
}

pub async fn run_hotspot_query(
    pool: &PgPool,
    hotspot_type: &str,
    last_processed_block: i64,
    max_block: i64,
) -> Vec<Value> {
    sqlx::query(HOTSPOT_SQL)
        .bind(hotspot_type)
        .bind(last_processed_block)
        .bind(max_block)
        .fetch_all(pool)
        .await
        .expect("run hotspot query")
        .into_iter()
        .map(|row| row.get::<Value, _>("atomic_data"))
        .collect()
}
