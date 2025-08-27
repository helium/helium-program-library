use crate::config::HotspotType;
use anyhow::Result;
use std::collections::HashMap;

/// SQL queries for constructing atomic hotspot data from multiple tables
pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  /// Get all available query templates
  pub fn get_all_queries() -> HashMap<String, &'static str> {
    let mut queries = HashMap::new();

    // Mobile hotspot atomic data construction
    queries.insert(
      "construct_atomic_mobile_hotspot".to_string(),
      Self::CONSTRUCT_ATOMIC_MOBILE_HOTSPOT,
    );

    // IoT hotspot atomic data construction
    queries.insert(
      "construct_atomic_iot_hotspot".to_string(),
      Self::CONSTRUCT_ATOMIC_IOT_HOTSPOT,
    );

    // Generic hotspot query (when hotspot type is determined dynamically)
    queries.insert(
      "construct_atomic_hotspot_generic".to_string(),
      Self::CONSTRUCT_ATOMIC_HOTSPOT_GENERIC,
    );

    queries
  }

  /// Get query by name
  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  /// Get query for specific hotspot type
  pub fn get_query_for_hotspot_type(hotspot_type: &HotspotType) -> &'static str {
    match hotspot_type {
      HotspotType::Mobile => Self::CONSTRUCT_ATOMIC_MOBILE_HOTSPOT,
      HotspotType::Iot => Self::CONSTRUCT_ATOMIC_IOT_HOTSPOT,
    }
  }

  /// Construct atomic mobile hotspot data by joining multiple tables
  ///
  /// This query joins:
  /// - mobile_hotspot_infos: Core hotspot account data
  /// - asset_owners: Current NFT ownership information
  /// - hotspot_metadata: Additional metadata and location data
  /// - rewards_destinations: Rewards routing configuration
  const CONSTRUCT_ATOMIC_MOBILE_HOTSPOT: &'static str = r#"
    SELECT
      -- Core hotspot data
      mhi.last_block_height as block_height,
      EXTRACT(epoch FROM mhi.updated_at)::bigint as block_time_seconds,
      mhi.key as pub_key,
      mhi.address as asset,

      -- Device metadata
      mhi.serial_number,
      mhi.device_type,
      COALESCE(hm.location, mhi.location) as asserted_hex,
      COALESCE(hm.azimuth, 0) as azimuth,

      -- Ownership information
      COALESCE(ao.owner, mhi.owner) as owner,
      COALESCE(ao.owner_type, 'direct_owner') as owner_type,

      -- Rewards configuration
      COALESCE(rd.rewards_recipient, mhi.rewards_recipient) as rewards_recipient,

      -- Rewards split information (if configured)
      CASE
        WHEN rs.pub_key IS NOT NULL THEN
          json_build_object(
            'pub_key', rs.pub_key,
            'schedule', COALESCE(rs.schedule, ''),
            'total_shares', COALESCE(rs.total_shares, 100),
            'recipients', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'authority', rsr.authority,
                    'recipient', rsr.recipient,
                    'shares', rsr.shares,
                    'fixed_amount', rsr.fixed_amount
                  )
                )
                FROM rewards_split_recipients rsr
                WHERE rsr.rewards_split_key = rs.pub_key
              ),
              '[]'::json
            )
          )
        ELSE NULL
      END as rewards_split,

      -- Additional metadata for enrichment
      hm.elevation,
      hm.gain,
      hm.is_full_hotspot,
      mhi.created_at,
      mhi.updated_at

    FROM mobile_hotspot_infos mhi

    -- Join with asset ownership (may be different from hotspot account owner)
    LEFT JOIN asset_owners ao ON ao.asset = mhi.address

    -- Join with hotspot metadata for location/hardware details
    LEFT JOIN hotspot_metadata hm ON hm.hotspot_address = mhi.address

    -- Join with rewards destinations
    LEFT JOIN rewards_destinations rd ON rd.hotspot_address = mhi.address

    -- Join with rewards splits (if configured)
    LEFT JOIN rewards_splits rs ON rs.hotspot_address = mhi.address

    WHERE mhi.address = $PRIMARY_KEY

    -- Ensure we get the most recent data if there are multiple records
    ORDER BY mhi.last_block_height DESC, mhi.updated_at DESC
    LIMIT 1;
  "#;

  /// Construct atomic IoT hotspot data by joining multiple tables
  const CONSTRUCT_ATOMIC_IOT_HOTSPOT: &'static str = r#"
    SELECT
      -- Core hotspot data
      ihi.last_block_height as block_height,
      EXTRACT(epoch FROM ihi.updated_at)::bigint as block_time_seconds,
      ihi.key as pub_key,
      ihi.address as asset,

      -- Location and hardware metadata
      COALESCE(hm.location, ihi.location) as asserted_hex,
      COALESCE(hm.elevation, ihi.elevation, 0) as elevation,
      COALESCE(ihi.is_data_only, false) as is_data_only,

      -- Ownership information
      COALESCE(ao.owner, ihi.owner) as owner,
      COALESCE(ao.owner_type, 'direct_owner') as owner_type,

      -- Rewards configuration
      COALESCE(rd.rewards_recipient, ihi.rewards_recipient) as rewards_recipient,

      -- Rewards split information (if configured)
      CASE
        WHEN rs.pub_key IS NOT NULL THEN
          json_build_object(
            'pub_key', rs.pub_key,
            'schedule', COALESCE(rs.schedule, ''),
            'total_shares', COALESCE(rs.total_shares, 100),
            'recipients', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'authority', rsr.authority,
                    'recipient', rsr.recipient,
                    'shares', rsr.shares,
                    'fixed_amount', rsr.fixed_amount
                  )
                )
                FROM rewards_split_recipients rsr
                WHERE rsr.rewards_split_key = rs.pub_key
              ),
              '[]'::json
            )
          )
        ELSE NULL
      END as rewards_split,

      -- Additional metadata
      hm.gain,
      hm.is_full_hotspot,
      ihi.created_at,
      ihi.updated_at

    FROM iot_hotspot_infos ihi

    -- Join with asset ownership
    LEFT JOIN asset_owners ao ON ao.asset = ihi.address

    -- Join with hotspot metadata
    LEFT JOIN hotspot_metadata hm ON hm.hotspot_address = ihi.address

    -- Join with rewards destinations
    LEFT JOIN rewards_destinations rd ON rd.hotspot_address = ihi.address

    -- Join with rewards splits
    LEFT JOIN rewards_splits rs ON rs.hotspot_address = ihi.address

    WHERE ihi.address = $PRIMARY_KEY

    ORDER BY ihi.last_block_height DESC, ihi.updated_at DESC
    LIMIT 1;
  "#;

  /// Generic hotspot query that works for both mobile and IoT
  /// Useful when hotspot type needs to be determined dynamically
  const CONSTRUCT_ATOMIC_HOTSPOT_GENERIC: &'static str = r#"
    WITH hotspot_data AS (
      -- Mobile hotspots
      SELECT
        'mobile' as hotspot_type,
        mhi.last_block_height as block_height,
        EXTRACT(epoch FROM mhi.updated_at)::bigint as block_time_seconds,
        mhi.key as pub_key,
        mhi.address as asset,
        mhi.serial_number,
        mhi.device_type,
        COALESCE(hm.location, mhi.location) as asserted_hex,
        COALESCE(hm.azimuth, 0) as azimuth,
        COALESCE(hm.elevation, 0) as elevation,
        false as is_data_only,
        COALESCE(ao.owner, mhi.owner) as owner,
        COALESCE(ao.owner_type, 'direct_owner') as owner_type,
        COALESCE(rd.rewards_recipient, mhi.rewards_recipient) as rewards_recipient,
        mhi.created_at,
        mhi.updated_at
      FROM mobile_hotspot_infos mhi
      LEFT JOIN asset_owners ao ON ao.asset = mhi.address
      LEFT JOIN hotspot_metadata hm ON hm.hotspot_address = mhi.address
      LEFT JOIN rewards_destinations rd ON rd.hotspot_address = mhi.address
      WHERE mhi.address = $PRIMARY_KEY

      UNION ALL

      -- IoT hotspots
      SELECT
        'iot' as hotspot_type,
        ihi.last_block_height as block_height,
        EXTRACT(epoch FROM ihi.updated_at)::bigint as block_time_seconds,
        ihi.key as pub_key,
        ihi.address as asset,
        NULL as serial_number,
        NULL as device_type,
        COALESCE(hm.location, ihi.location) as asserted_hex,
        0 as azimuth,
        COALESCE(hm.elevation, ihi.elevation, 0) as elevation,
        COALESCE(ihi.is_data_only, false) as is_data_only,
        COALESCE(ao.owner, ihi.owner) as owner,
        COALESCE(ao.owner_type, 'direct_owner') as owner_type,
        COALESCE(rd.rewards_recipient, ihi.rewards_recipient) as rewards_recipient,
        ihi.created_at,
        ihi.updated_at
      FROM iot_hotspot_infos ihi
      LEFT JOIN asset_owners ao ON ao.asset = ihi.address
      LEFT JOIN hotspot_metadata hm ON hm.hotspot_address = ihi.address
      LEFT JOIN rewards_destinations rd ON rd.hotspot_address = ihi.address
      WHERE ihi.address = $PRIMARY_KEY
    )
    SELECT
      hd.*,
      -- Add rewards split information
      CASE
        WHEN rs.pub_key IS NOT NULL THEN
          json_build_object(
            'pub_key', rs.pub_key,
            'schedule', COALESCE(rs.schedule, ''),
            'total_shares', COALESCE(rs.total_shares, 100),
            'recipients', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'authority', rsr.authority,
                    'recipient', rsr.recipient,
                    'shares', rsr.shares,
                    'fixed_amount', rsr.fixed_amount
                  )
                )
                FROM rewards_split_recipients rsr
                WHERE rsr.rewards_split_key = rs.pub_key
              ),
              '[]'::json
            )
          )
        ELSE NULL
      END as rewards_split
    FROM hotspot_data hd
    LEFT JOIN rewards_splits rs ON rs.hotspot_address = hd.asset
    ORDER BY hd.block_height DESC, hd.updated_at DESC
    LIMIT 1;
  "#;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_query_retrieval() {
    let queries = AtomicHotspotQueries::get_all_queries();
    assert!(queries.len() >= 3);
    assert!(queries.contains_key("construct_atomic_mobile_hotspot"));
    assert!(queries.contains_key("construct_atomic_iot_hotspot"));
    assert!(queries.contains_key("construct_atomic_hotspot_generic"));
  }

  #[test]
  fn test_query_by_hotspot_type() {
    let mobile_query = AtomicHotspotQueries::get_query_for_hotspot_type(&HotspotType::Mobile);
    let iot_query = AtomicHotspotQueries::get_query_for_hotspot_type(&HotspotType::Iot);

    assert!(mobile_query.contains("mobile_hotspot_infos"));
    assert!(iot_query.contains("iot_hotspot_infos"));
  }

  #[test]
  fn test_queries_contain_primary_key_placeholder() {
    let queries = AtomicHotspotQueries::get_all_queries();

    for (name, query) in queries {
      assert!(
        query.contains("$PRIMARY_KEY"),
        "Query '{}' missing $PRIMARY_KEY placeholder",
        name
      );
    }
  }
}
