use std::collections::HashMap;
use std::sync::OnceLock;

/// Module for managing SQL queries used in the atomic data publisher service.
///
/// This module provides a centralized location for all SQL queries used to extract
/// and transform data for atomic publishing. The queries are designed to work with
/// PostgreSQL and use parameterized queries for security and performance.
pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  pub fn get_all_queries() -> &'static HashMap<&'static str, &'static str> {
    static QUERIES: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    QUERIES.get_or_init(|| {
      let mut queries = HashMap::new();
      queries.insert("construct_atomic_hotspots", Self::CONSTRUCT_ATOMIC_HOTSPOTS);
      queries.insert(
        "construct_entity_ownership_changes",
        Self::CONSTRUCT_ENTITY_OWNERSHIP_CHANGES,
      );
      queries.insert(
        "construct_entity_reward_destination_changes",
        Self::CONSTRUCT_ENTITY_REWARD_DESTINATION_CHANGES,
      );
      queries
    })
  }

  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  pub fn validate_query_name(query_name: &str) -> Result<(), String> {
    let valid_queries = Self::get_all_queries();
    if valid_queries.contains_key(query_name) {
      Ok(())
    } else {
      Err(format!(
        "Invalid query name: '{}'. Valid queries are: {:?}",
        query_name,
        valid_queries.keys().collect::<Vec<_>>()
      ))
    }
  }

  /// Parameters:
  /// - $1: hotspot_type - Either 'mobile' or 'iot' to filter for specific hotspot type
  /// - $2: last_processed_block - The last block that was already processed
  /// - $3: max_block - The maximum block number to process (exclusive)
  ///
  /// Returns: job_name, solana_address, asset, block, atomic_data (JSON)
  pub const CONSTRUCT_ATOMIC_HOTSPOTS: &'static str = r#"
    WITH hotspot_metadata_changes AS (
      SELECT
        mhi.address,
        mhi.asset,
        mhi.last_block,
        mhi.location,
        'mobile' as hotspot_type,
        mhi.device_type,
        NULL as elevation,
        NULL as gain,
        mhi.is_full_hotspot,
        mhi.deployment_info
      FROM mobile_hotspot_infos mhi
      WHERE mhi.asset IS NOT NULL
        AND mhi.last_block > $2
        AND mhi.last_block <= $3
        AND $1 = 'mobile'

      UNION ALL

      SELECT
        ihi.address,
        ihi.asset,
        ihi.last_block,
        ihi.location,
        'iot' as hotspot_type,
        NULL as device_type,
        ihi.elevation,
        ihi.gain,
        ihi.is_full_hotspot,
        NULL::jsonb as deployment_info
      FROM iot_hotspot_infos ihi
      WHERE ihi.asset IS NOT NULL
        AND ihi.last_block > $2
        AND ihi.last_block <= $3
        AND $1 = 'iot'
    )
    SELECT
      CONCAT('atomic_', hmc.hotspot_type, '_hotspots') as job_name,
      hmc.address as solana_address,
      hmc.asset,
      hmc.last_block as block,
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
        'block', hmc.last_block
      ) as atomic_data
    FROM hotspot_metadata_changes hmc
    LEFT JOIN key_to_assets kta ON kta.asset = hmc.asset
    WHERE kta.encoded_entity_key IS NOT NULL
    ORDER BY hmc.last_block DESC;
  "#;

  /// Parameters:
  /// - $1: last_processed_block - The last block that was already processed
  /// - $2: max_block - The maximum block number to process (exclusive)
  ///
  /// Returns: job_name, block, solana_address, asset, atomic_data (JSON)
  pub const CONSTRUCT_ENTITY_OWNERSHIP_CHANGES: &'static str = r#"
    WITH asset_owner_changes AS (
      -- Get asset owner changes in the block range
      SELECT
        ao.asset,
        ao.last_block as block,
        kta.encoded_entity_key as pub_key,
        ao.owner,
        'direct_owner' as owner_type,
        'entity_ownership' as change_type
      FROM asset_owners ao
      INNER JOIN key_to_assets kta ON kta.asset = ao.asset
      WHERE ao.last_block > $1
        AND ao.last_block <= $2
        AND kta.encoded_entity_key IS NOT NULL
        AND ao.asset IS NOT NULL
        AND ao.owner IS NOT NULL
    ),
    welcome_pack_changes AS (
      -- Get welcome pack owner changes in the block range
      SELECT
        wp.asset,
        wp.last_block as block,
        kta.encoded_entity_key as pub_key,
        wp.owner,
        'welcome_pack_owner' as owner_type,
        'entity_ownership' as change_type
      FROM welcome_packs wp
      INNER JOIN key_to_assets kta ON kta.asset = wp.asset
      WHERE wp.last_block > $1
        AND wp.last_block <= $2
        AND kta.encoded_entity_key IS NOT NULL
        AND wp.asset IS NOT NULL
        AND wp.owner IS NOT NULL
    ),
    ownership_changes AS (
      SELECT asset, block, pub_key, owner, owner_type, change_type
      FROM asset_owner_changes
      UNION ALL
      SELECT asset, block, pub_key, owner, owner_type, change_type
      FROM welcome_pack_changes
    )
    SELECT
      'entity_ownership_changes' as job_name,
      block,
      pub_key as solana_address,
      asset,
      JSON_BUILD_OBJECT(
        'pub_key', pub_key,
        'asset', asset,
        'owner', owner,
        'owner_type', owner_type,
        'change_type', change_type,
        'block', block
      ) as atomic_data
    FROM ownership_changes
    ORDER BY block DESC;
  "#;

  /// Parameters:
  /// - $1: last_processed_block - The last block that was already processed
  /// - $2: max_block - The maximum block number to process (exclusive)
  ///
  /// Returns: job_name, block, solana_address, asset, atomic_data (JSON)
  pub const CONSTRUCT_ENTITY_REWARD_DESTINATION_CHANGES: &'static str = r#"
    WITH direct_recipient_changes AS (
      -- Get direct recipient changes in the block range
      SELECT
        r.asset,
        r.last_block as block,
        kta.encoded_entity_key as pub_key,
        r.destination as rewards_recipient,
        NULL::text as rewards_split_data,
        'entity_reward_destination' as change_type
      FROM recipients r
      INNER JOIN key_to_assets kta ON kta.asset = r.asset
      WHERE r.last_block > $1
        AND r.last_block <= $2
        AND kta.encoded_entity_key IS NOT NULL
        AND r.asset IS NOT NULL
        AND r.destination IS NOT NULL
    ),
    fanout_recipient_changes AS (
      -- Get fanout recipient changes in the block range
      SELECT
        rr.asset,
        rr.last_block as block,
        rr.encoded_entity_key as pub_key,
        rr.destination as rewards_recipient,
        JSON_BUILD_OBJECT(
          'owner', rr.owner,
          'destination', rr.destination,
          'shares', rr.shares,
          'total_shares', rr.total_shares,
          'fixed_amount', rr.fixed_amount,
          'type', rr.type
        )::text as rewards_split_data,
        'entity_reward_destination' as change_type
      FROM rewards_recipients rr
      WHERE rr.last_block > $1
        AND rr.last_block <= $2
        AND rr.encoded_entity_key IS NOT NULL
        AND rr.asset IS NOT NULL
        AND rr.destination IS NOT NULL
        AND rr.type = 'fanout'
    ),
    direct_with_fanout_updates AS (
      -- Update direct recipients with fanout data if available
      SELECT
        drc.asset,
        GREATEST(drc.block, COALESCE(frc.block, 0)) as block,
        drc.pub_key,
        drc.rewards_recipient,
        COALESCE(frc.rewards_split_data, NULL::text) as rewards_split_data,
        drc.change_type
      FROM direct_recipient_changes drc
      LEFT JOIN fanout_recipient_changes frc ON frc.asset = drc.asset
    ),
    fanout_only_changes AS (
      -- Get fanout-only changes (no direct recipient exists)
      SELECT
        frc.asset,
        frc.block,
        frc.pub_key,
        frc.rewards_recipient,
        frc.rewards_split_data,
        frc.change_type
      FROM fanout_recipient_changes frc
      WHERE NOT EXISTS (
        SELECT 1 FROM direct_recipient_changes drc WHERE drc.asset = frc.asset
      )
    ),
    reward_destination_changes AS (
      SELECT asset, block, pub_key, rewards_recipient, rewards_split_data, change_type
      FROM direct_with_fanout_updates
      UNION ALL
      SELECT asset, block, pub_key, rewards_recipient, rewards_split_data, change_type
      FROM fanout_only_changes
    )
    SELECT
      'entity_reward_destination_changes' as job_name,
      block,
      pub_key as solana_address,
      asset,
      JSON_BUILD_OBJECT(
        'pub_key', pub_key,
        'asset', asset,
        'rewards_recipient', rewards_recipient,
        'rewards_split_data', rewards_split_data,
        'change_type', change_type,
        'block', block
      ) as atomic_data
    FROM reward_destination_changes
    ORDER BY block DESC;
  "#;
}
