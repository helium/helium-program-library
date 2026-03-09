mod common;

use common::*;
use serde_json::json;
use sqlx::PgPool;

// --- Ownership Resolution ---

#[sqlx::test(migrations = "tests/migrations")]
async fn ownership_direct_owner(pool: PgPool) {
    let asset = "asset_direct";
    let wallet_a = "wallet_A";
    let entity_key: Vec<u8> = vec![0xAB, 0xCD, 0xEF];

    seed_key_to_asset(&pool, "kta_1", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, wallet_a, 200).await;

    let results = run_ownership_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["owner_type"], "direct_owner");
    assert_eq!(results[0]["owner"], wallet_a);
    assert_eq!(results[0]["asset"], asset);
    assert_eq!(results[0]["pub_key"], hex::encode(&entity_key));
    assert_eq!(results[0]["change_type"], "entity_ownership");
}

#[sqlx::test(migrations = "tests/migrations")]
async fn ownership_welcome_pack_resolution(pool: PgPool) {
    let asset = "asset_wp";
    let wp_pda = "wp_pda_address";
    let real_wallet_b = "real_wallet_B";
    let entity_key: Vec<u8> = vec![0x01, 0x02, 0x03];

    seed_key_to_asset(&pool, "kta_2", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, wp_pda, 200).await;
    seed_welcome_pack(&pool, wp_pda, real_wallet_b).await;

    let results = run_ownership_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["owner_type"], "welcome_pack_owner");
    assert_eq!(results[0]["owner"], real_wallet_b);
}

#[sqlx::test(migrations = "tests/migrations")]
async fn ownership_claimed_welcome_pack_becomes_direct(pool: PgPool) {
    let asset = "asset_claimed";
    let user_wallet_c = "user_wallet_C";
    let entity_key: Vec<u8> = vec![0x04, 0x05, 0x06];

    seed_key_to_asset(&pool, "kta_3", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, user_wallet_c, 200).await;
    seed_welcome_pack(&pool, "some_other_pda", "some_other_wallet").await;

    let results = run_ownership_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["owner_type"], "direct_owner");
    assert_eq!(results[0]["owner"], user_wallet_c);
}

// --- Reward Destination Resolution ---

#[sqlx::test(migrations = "tests/migrations")]
async fn reward_direct_when_no_recipient(pool: PgPool) {
    let asset = "asset_reward_direct";
    let wallet_e = "wallet_E";
    let entity_key: Vec<u8> = vec![0x10, 0x11, 0x12];

    seed_key_to_asset(&pool, "kta_6", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, wallet_e, 200).await;

    let results = run_reward_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["rewards_recipient"], wallet_e);
    assert!(results[0]["rewards_split"].is_null());
}

#[sqlx::test(migrations = "tests/migrations")]
async fn reward_system_program_destination_treated_as_direct(pool: PgPool) {
    let asset = "asset_sysprog";
    let wallet_f = "wallet_F";
    let entity_key: Vec<u8> = vec![0x13, 0x14, 0x15];

    seed_key_to_asset(&pool, "kta_7", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, wallet_f, 200).await;
    seed_recipient(
        &pool,
        "recip_1",
        LAZY_DISTRIBUTOR,
        asset,
        SYSTEM_PROGRAM,
        180,
    )
    .await;

    let results = run_reward_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["rewards_recipient"], wallet_f);
    assert!(results[0]["rewards_split"].is_null());
}

#[sqlx::test(migrations = "tests/migrations")]
async fn reward_mini_fanout_produces_split(pool: PgPool) {
    let asset = "asset_fanout";
    let owner_wallet = "owner_wallet";
    let fanout_addr = "fanout_address";
    let authority_wallet = "authority_wallet";
    let entity_key: Vec<u8> = vec![0x16, 0x17, 0x18];

    seed_key_to_asset(&pool, "kta_8", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, owner_wallet, 100).await;
    seed_recipient(
        &pool,
        "recip_2",
        LAZY_DISTRIBUTOR,
        asset,
        fanout_addr,
        200,
    )
    .await;

    let shares = vec![
        json!({
            "wallet": "wallet_w1",
            "share": { "share": { "amount": 6000 } }
        }),
        json!({
            "wallet": "wallet_w2",
            "share": { "share": { "amount": 4000 } }
        }),
    ];
    seed_mini_fanout(&pool, fanout_addr, authority_wallet, "daily", &shares, 200).await;

    let results = run_reward_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    // When there's a split, rewards_recipient is null
    assert!(results[0]["rewards_recipient"].is_null());

    let split = &results[0]["rewards_split"];
    assert_eq!(split["pub_key"], fanout_addr);
    assert_eq!(split["schedule"], "daily");
    assert_eq!(split["total_shares"], 10000);

    let recipients = split["recipients"].as_array().expect("recipients array");
    assert_eq!(recipients.len(), 2);

    assert_eq!(recipients[0]["authority"], authority_wallet);
    assert_eq!(recipients[0]["recipient"], "wallet_w1");
    assert_eq!(recipients[0]["shares"], 6000);

    assert_eq!(recipients[1]["authority"], authority_wallet);
    assert_eq!(recipients[1]["recipient"], "wallet_w2");
    assert_eq!(recipients[1]["shares"], 4000);
}

#[sqlx::test(migrations = "tests/migrations")]
async fn reward_welcome_pack_resolves_owner(pool: PgPool) {
    let asset = "asset_reward_wp";
    let wp_pda = "wp_pda_reward";
    let real_wallet_g = "real_wallet_G";
    let entity_key: Vec<u8> = vec![0x19, 0x1A, 0x1B];

    seed_key_to_asset(&pool, "kta_9", &entity_key, asset).await;
    seed_asset_owner(&pool, asset, wp_pda, 200).await;
    seed_welcome_pack(&pool, wp_pda, real_wallet_g).await;
    // No recipients, no mini_fanout

    let results = run_reward_query(&pool, 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["rewards_recipient"], real_wallet_g);
    assert!(results[0]["rewards_split"].is_null());
}

// --- Hotspot Metadata ---

#[sqlx::test(migrations = "tests/migrations")]
async fn hotspot_mobile_produces_correct_json(pool: PgPool) {
    let asset = "asset_mobile";
    let entity_key: Vec<u8> = vec![0x20, 0x21, 0x22];
    let deployment_info = json!({
        "wifiInfoV0": {
            "serial": "SN-12345",
            "azimuth": 90
        }
    });

    seed_key_to_asset(&pool, "kta_10", &entity_key, asset).await;
    seed_mobile_hotspot(
        &pool,
        "mhi_10",
        asset,
        200,
        Some("8c2ab38b6e899ff"),
        "wifiOutdoor",
        true,
        Some(deployment_info.clone()),
    )
    .await;

    let results = run_hotspot_query(&pool, "mobile", 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["pub_key"], hex::encode(&entity_key));
    assert_eq!(results[0]["asset"], asset);
    assert_eq!(results[0]["device_type"], "wifiOutdoor");
    assert_eq!(results[0]["location"], "8c2ab38b6e899ff");
    assert_eq!(results[0]["deployment_info"], deployment_info);
    assert_eq!(results[0]["is_full_hotspot"], true);
    assert_eq!(results[0]["hotspot_type"], "mobile");
}

#[sqlx::test(migrations = "tests/migrations")]
async fn hotspot_iot_produces_correct_json(pool: PgPool) {
    let asset = "asset_iot";
    let entity_key: Vec<u8> = vec![0x30, 0x31, 0x32];

    seed_key_to_asset(&pool, "kta_11", &entity_key, asset).await;
    seed_iot_hotspot(
        &pool,
        "ihi_11",
        asset,
        200,
        Some("8c2ab38b6e899ff"),
        Some(42),
        Some(12),
        true,
    )
    .await;

    let results = run_hotspot_query(&pool, "iot", 150, 250).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0]["pub_key"], hex::encode(&entity_key));
    assert_eq!(results[0]["asset"], asset);
    assert_eq!(results[0]["elevation"], 42);
    assert_eq!(results[0]["gain"], 12);
    assert_eq!(results[0]["location"], "8c2ab38b6e899ff");
    assert_eq!(results[0]["is_full_hotspot"], true);
    assert_eq!(results[0]["hotspot_type"], "iot");
}

#[sqlx::test(migrations = "tests/migrations")]
async fn hotspot_missing_entity_key_excluded(pool: PgPool) {
    let asset = "asset_no_key";

    // Mobile hotspot exists but no key_to_assets entry
    seed_mobile_hotspot(
        &pool,
        "mhi_12",
        asset,
        200,
        None,
        "wifiIndoor",
        true,
        None,
    )
    .await;

    let results = run_hotspot_query(&pool, "mobile", 150, 250).await;

    assert!(results.is_empty());
}
