use std::collections::HashMap;

pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  pub fn get_all_queries() -> HashMap<String, &'static str> {
    let mut queries = HashMap::new();

    queries.insert(
      "construct_atomic_hotspots".to_string(),
      Self::CONSTRUCT_ATOMIC_HOTSPOTS,
    );

    queries.insert(
      "construct_entity_ownership_changes".to_string(),
      Self::CONSTRUCT_ENTITY_OWNERSHIP_CHANGES,
    );

    queries.insert(
      "construct_entity_reward_destination_changes".to_string(),
      Self::CONSTRUCT_ENTITY_REWARD_DESTINATION_CHANGES,
    );

    queries
  }

  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  // Parameters: $1 = hotspot_type (mobile/iot), $2 = last_processed_block_height, $3 = current_solana_block_height
  pub const CONSTRUCT_ATOMIC_HOTSPOTS: &'static str = r#"
    WITH hotspot_metadata_changes AS (
      SELECT
        mhi.address,
        mhi.asset,
        mhi.last_block_height,
        mhi.refreshed_at,
        mhi.location,
        'mobile' as hotspot_type,
        mhi.device_type,
        NULL as elevation,
        NULL as gain,
        mhi.is_full_hotspot,
        mhi.deployment_info
      FROM mobile_hotspot_infos mhi
      WHERE mhi.asset IS NOT NULL
        AND mhi.last_block_height > $2
        AND mhi.last_block_height <= $3
        AND $1 = 'mobile'

      UNION ALL

      SELECT
        ihi.address,
        ihi.asset,
        ihi.last_block_height,
        ihi.refreshed_at,
        ihi.location,
        'iot' as hotspot_type,
        NULL as device_type,
        ihi.elevation,
        ihi.gain,
        ihi.is_full_hotspot,
        NULL::jsonb as deployment_info
      FROM iot_hotspot_infos ihi
      WHERE ihi.asset IS NOT NULL
        AND ihi.last_block_height > $2
        AND ihi.last_block_height <= $3
        AND $1 = 'iot'
    )
    SELECT
      CONCAT('atomic_', hmc.hotspot_type, '_hotspots') as job_name,
      hmc.address as solana_address,
      hmc.asset,
      hmc.last_block_height as block_height,
      hmc.refreshed_at as refreshed_at,
      JSON_BUILD_OBJECT(
        'pub_key', kta.encoded_entity_key,
        'asset', hmc.asset,
        'address', hmc.address,
        'location', hmc.location,
        'hotspot_type', hmc.hotspot_type,
        'device_type', hmc.device_type,
        'elevation', hmc.elevation,
        'gain', hmc.gain,
        'is_full_hotspot', hmc.is_full_hotspot,
        'deployment_info', hmc.deployment_info,
        'block_height', hmc.last_block_height,
        'refreshed_at', hmc.refreshed_at
      ) as atomic_data
    FROM hotspot_metadata_changes hmc
    LEFT JOIN key_to_assets kta ON kta.asset = hmc.asset
    WHERE kta.encoded_entity_key IS NOT NULL
    ORDER BY hmc.last_block_height DESC;
  "#;

  // Parameters: $1 = last_processed_block_height, $2 = current_solana_block_height
  pub const CONSTRUCT_ENTITY_OWNERSHIP_CHANGES: &'static str = r#"
    WITH ownership_changes AS (
      SELECT DISTINCT
        ao.asset,
        ao.last_block_height as block_height,
        ao.refreshed_at as refreshed_at,
        kta.encoded_entity_key as pub_key,
        ao.owner,
        ao.owner_type,
        'entity_ownership' as change_type
      FROM asset_owners ao
      LEFT JOIN key_to_assets kta ON kta.asset = ao.asset
      WHERE ao.last_block_height > $1
        AND ao.last_block_height <= $2
        AND kta.encoded_entity_key IS NOT NULL
        AND ao.asset IS NOT NULL
        AND ao.owner IS NOT NULL
    )
    SELECT
      'entity_ownership_changes' as job_name,
      block_height,
      refreshed_at,
      pub_key as solana_address,
      asset,
      JSON_BUILD_OBJECT(
        'pub_key', pub_key,
        'asset', asset,
        'owner', owner,
        'owner_type', owner_type,
        'change_type', change_type,
        'block_height', block_height,
        'refreshed_at', refreshed_at
      ) as atomic_data
    FROM ownership_changes
    ORDER BY block_height DESC;
  "#;

  // Parameters: $1 = last_processed_block_height, $2 = current_solana_block_height
  pub const CONSTRUCT_ENTITY_REWARD_DESTINATION_CHANGES: &'static str = r#"
    WITH reward_destination_changes AS (
      -- Changes from recipients table
      SELECT DISTINCT
        r.asset,
        r.last_block_height as block_height,
        r.refreshed_at as refreshed_at,
        kta.encoded_entity_key as pub_key,
        r.recipient as rewards_recipient,
        NULL::text as rewards_split_data,
        'entity_reward_destination' as change_type
      FROM recipients r
      LEFT JOIN key_to_assets kta ON kta.asset = r.asset
      WHERE r.last_block_height > $1
        AND r.last_block_height <= $2
        AND kta.encoded_entity_key IS NOT NULL
        AND r.asset IS NOT NULL
        AND r.recipient IS NOT NULL

      UNION ALL

      -- Changes from mini_fanouts table (reward splits)
      SELECT DISTINCT
        mf.asset,
        mf.last_block_height as block_height,
        mf.refreshed_at as refreshed_at,
        kta.encoded_entity_key as pub_key,
        NULL::text as rewards_recipient,
        JSON_BUILD_OBJECT(
          'pub_key', mf.owner,
          'schedule', mf.schedule,
          'total_shares', mf.total_shares,
          'recipients', mf.recipients
        )::text as rewards_split_data,
        'entity_reward_destination' as change_type
      FROM mini_fanouts mf
      LEFT JOIN key_to_assets kta ON kta.asset = mf.asset
      WHERE mf.last_block_height > $1
        AND mf.last_block_height <= $2
        AND kta.encoded_entity_key IS NOT NULL
        AND mf.asset IS NOT NULL
    )
    SELECT
      'entity_reward_destination_changes' as job_name,
      block_height,
      refreshed_at,
      pub_key as solana_address,
      asset,
      JSON_BUILD_OBJECT(
        'pub_key', pub_key,
        'asset', asset,
        'rewards_recipient', rewards_recipient,
        'rewards_split_data', rewards_split_data,
        'change_type', change_type,
        'block_height', block_height,
        'refreshed_at', refreshed_at
      ) as atomic_data
    FROM reward_destination_changes
    ORDER BY block_height DESC;
  "#;
}
