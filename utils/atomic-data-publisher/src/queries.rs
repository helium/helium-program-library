use crate::config::HotspotType;
use std::collections::HashMap;

/// SQL queries for constructing atomic hotspot data from multiple tables
pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  /// Get all available query templates
  pub fn get_all_queries() -> HashMap<String, &'static str> {
    let mut queries = HashMap::new();

    // Unified atomic hotspot construction query
    queries.insert(
      "construct_atomic_hotspot".to_string(),
      Self::CONSTRUCT_ATOMIC_HOTSPOT,
    );

    queries
  }

  /// Get query by name
  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  /// Get query for specific hotspot type (now unified for all types)
  pub fn get_query_for_hotspot_type(_hotspot_type: &HotspotType) -> &'static str {
    Self::CONSTRUCT_ATOMIC_HOTSPOT
  }

  /// Unified atomic hotspot construction query that works for both mobile and IoT
  /// Takes hotspot type as parameter and constructs complete atomic hotspot data
  /// Returns the maximum last_block_height from all joined tables for proper polling
  const CONSTRUCT_ATOMIC_HOTSPOT: &'static str = r#"
    WITH hotspot_base AS (
            -- Mobile hotspot data
      SELECT
        'mobile' as hotspot_type,
        kta.encoded_entity_key as pub_key,
        mhi.device_type,
        mhi.deployment_info->'wifiInfoV0'->>'serial' as serial_number,
        COALESCE((mhi.deployment_info->'wifiInfoV0'->>'azimuth')::numeric, 0) as azimuth,
        COALESCE((mhi.deployment_info->'wifiInfoV0'->>'elevation')::numeric, 0) as elevation,
        0 as gain, -- Mobile hotspots don't have gain
        mhi.asset,
        mhi.address as solana_address, -- Keep solana address for mini_fanouts join
        mhi.location as asserted_hex,
        mhi.is_full_hotspot,
        mhi.num_location_asserts,
        mhi.is_active,
        mhi.dc_onboarding_fee_paid,
        mhi.refreshed_at,
        mhi.last_block_height as base_block_height
      FROM mobile_hotspot_infos mhi
      LEFT JOIN key_to_assets kta ON kta.asset = mhi.asset
      WHERE mhi.address = $PRIMARY_KEY AND $HOTSPOT_TYPE = 'mobile'

      UNION ALL

            -- IoT hotspot data
      SELECT
        'iot' as hotspot_type,
        kta.encoded_entity_key as pub_key,
        NULL as device_type, -- IoT hotspots don't have device_type
        NULL as serial_number, -- IoT hotspots don't have serial numbers
        0 as azimuth, -- IoT hotspots don't have azimuth
        ihi.elevation,
        ihi.gain,
        ihi.asset,
        ihi.address as solana_address, -- Keep solana address for mini_fanouts join
        ihi.location as asserted_hex,
        ihi.is_full_hotspot,
        ihi.num_location_asserts,
        ihi.is_active,
        ihi.dc_onboarding_fee_paid,
        ihi.refreshed_at,
        ihi.last_block_height as base_block_height
      FROM iot_hotspot_infos ihi
      LEFT JOIN key_to_assets kta ON kta.asset = ihi.asset
      WHERE ihi.address = $PRIMARY_KEY AND $HOTSPOT_TYPE = 'iot'
    ),
    enriched_hotspot AS (
      SELECT
        hb.*,
        -- Ownership information with welcome pack logic
        CASE
          WHEN wp.owner IS NOT NULL THEN wp.owner
          ELSE ao.owner
        END as owner,
        CASE
          WHEN wp.owner IS NOT NULL THEN 'welcome_pack_owner'
          ELSE 'direct_owner'
        END as owner_type,
        -- Rewards recipient information
        rr.destination as rewards_recipient,
        -- Mini fanout information (rewards splits)
        CASE
          WHEN mf.address IS NOT NULL THEN
            json_build_object(
              'pub_key', mf.address,
              'owner', mf.owner,
              'namespace', mf.namespace,
              'schedule', COALESCE(mf.schedule, ''),
              'shares', CASE
                WHEN mf.shares IS NOT NULL THEN
                  (
                    SELECT json_agg(share_elem::jsonb)
                    FROM unnest(mf.shares) AS share_elem
                  )
                ELSE '[]'::json
              END
            )
          ELSE NULL
        END as rewards_split,
        -- Track block heights from all joined tables for proper polling
        GREATEST(
          hb.base_block_height,
          COALESCE(ao.last_block_height, 0),
          COALESCE(wp.last_block_height, 0),
          COALESCE(mf.last_block_height, 0)
        ) as max_block_height
      FROM hotspot_base hb
      LEFT JOIN asset_owners ao ON ao.asset = hb.asset
      LEFT JOIN welcome_packs wp ON wp.address = ao.owner
      LEFT JOIN rewards_recipients rr ON rr.asset = hb.asset
      LEFT JOIN mini_fanouts mf ON mf.owner = hb.solana_address
    )
    SELECT
      eh.*,
      -- Additional metadata if needed
      CASE
        WHEN eh.hotspot_type = 'mobile' THEN
          json_build_object(
            'device_type', eh.device_type,
            'serial_number', eh.serial_number,
            'azimuth', eh.azimuth
          )
        ELSE
          json_build_object(
            'gain', eh.gain,
            'elevation', eh.elevation
          )
      END as type_specific_metadata
    FROM enriched_hotspot eh
    ORDER BY eh.max_block_height DESC
    LIMIT 1;
  "#;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_query_retrieval() {
    let queries = AtomicHotspotQueries::get_all_queries();
    assert_eq!(queries.len(), 1);
    assert!(queries.contains_key("construct_atomic_hotspot"));
  }

  #[test]
  fn test_query_by_hotspot_type() {
    let mobile_query = AtomicHotspotQueries::get_query_for_hotspot_type(&HotspotType::Mobile);
    let iot_query = AtomicHotspotQueries::get_query_for_hotspot_type(&HotspotType::Iot);

    // Both should use the unified query now
    assert_eq!(mobile_query, iot_query);
    assert_eq!(mobile_query, AtomicHotspotQueries::CONSTRUCT_ATOMIC_HOTSPOT);
    assert!(mobile_query.contains("mobile_hotspot_infos"));
    assert!(mobile_query.contains("iot_hotspot_infos"));
    assert!(mobile_query.contains("$HOTSPOT_TYPE"));
  }

  #[test]
  fn test_unified_query_contains_required_placeholders() {
    let unified_query = AtomicHotspotQueries::get_query("construct_atomic_hotspot").unwrap();

    assert!(
      unified_query.contains("$PRIMARY_KEY"),
      "Unified query missing $PRIMARY_KEY placeholder"
    );
    assert!(
      unified_query.contains("$HOTSPOT_TYPE"),
      "Unified query missing $HOTSPOT_TYPE placeholder"
    );
    assert!(
      unified_query.contains("max_block_height"),
      "Unified query missing max_block_height calculation"
    );
  }

  #[test]
  fn test_unified_query_contains_primary_key_placeholder() {
    let unified_query = AtomicHotspotQueries::get_query("construct_atomic_hotspot").unwrap();
    assert!(
      unified_query.contains("$PRIMARY_KEY"),
      "Unified query missing $PRIMARY_KEY placeholder"
    );
  }

  #[test]
  fn test_unified_query_structure() {
    let unified_query = AtomicHotspotQueries::get_query("construct_atomic_hotspot").unwrap();

    // Test that the query has the expected structure
    assert!(unified_query.contains("WITH hotspot_base AS"));
    assert!(unified_query.contains("enriched_hotspot AS"));
    assert!(unified_query.contains("GREATEST(")); // For max block height calculation
    assert!(unified_query.contains("type_specific_metadata"));
  }
}
