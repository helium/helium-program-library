use std::collections::HashMap;

/// SQL queries for constructing atomic hotspot data from multiple tables
pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  /// Get all available query templates
  pub fn get_all_queries() -> HashMap<String, &'static str> {
    let mut queries = HashMap::new();

    // Simplified batch query for finding hotspots that need updates
    queries.insert(
      "construct_atomic_hotspots".to_string(),
      Self::CONSTRUCT_ATOMIC_HOTSPOTS,
    );

    queries
  }

  /// Get query by name
  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  /// Highly optimized query using direct UNION approach for better index utilization
  /// Eliminates complex EXISTS subqueries and leverages composite indexes directly
  /// Parameters: $1 = hotspot_type (mobile/iot), $2 = last_processed_block_height, $3 = current_solana_block_height
  pub const CONSTRUCT_ATOMIC_HOTSPOTS: &'static str = r#"
    WITH assets_with_updates AS (
      -- Direct approach using composite indexes - much more efficient
      -- Each subquery uses optimal indexes: (asset, last_block_height)
      SELECT DISTINCT asset FROM (
        -- Asset owners updates (1.49M rows) - uses idx_asset_owners_asset_block_height
        SELECT asset FROM asset_owners
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        -- Key to assets updates (1.49M rows) - uses idx_key_to_assets_asset_block_height
        SELECT asset FROM key_to_assets
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        -- Recipients updates (1.18M rows) - uses idx_recipients_asset_block_height
        SELECT asset FROM recipients
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        -- Mobile hotspot direct updates (50K rows) - uses idx_mobile_hotspot_infos_asset_block_height
        SELECT asset FROM mobile_hotspot_infos
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3
        AND $1 = 'mobile'

        UNION ALL

        -- IoT hotspot direct updates (1.03M rows) - uses idx_iot_hotspot_infos_asset_block_height
        SELECT asset FROM iot_hotspot_infos
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3
        AND $1 = 'iot'

        UNION ALL

        -- Welcome packs (2 rows) - small table, minimal impact
        SELECT asset FROM welcome_packs
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        -- Mini fanouts updates - find assets affected by mini_fanouts changes
        -- Uses idx_mini_fanouts_owner_block_height and joins through asset_owners
        SELECT DISTINCT ao.asset FROM mini_fanouts mf
        INNER JOIN asset_owners ao ON ao.owner = mf.owner
        WHERE mf.last_block_height > $2 AND mf.last_block_height <= $3
        AND ao.asset IS NOT NULL
      ) all_asset_updates
    ),
    -- Find hotspot info for those assets based on hotspot type
    hotspot_data AS (
      SELECT
        mhi.address,
        mhi.asset,
        mhi.last_block_height,
        mhi.location,
        'mobile' as hotspot_type,
        mhi.device_type,
        NULL as elevation,
        NULL as gain,
        mhi.is_full_hotspot,
        mhi.deployment_info
      FROM mobile_hotspot_infos mhi
      INNER JOIN assets_with_updates awu ON awu.asset = mhi.asset
      WHERE $1 = 'mobile'

      UNION ALL

      SELECT
        ihi.address,
        ihi.asset,
        ihi.last_block_height,
        ihi.location,
        'iot' as hotspot_type,
        NULL as device_type,
        ihi.elevation,
        ihi.gain,
        ihi.is_full_hotspot,
        NULL::jsonb as deployment_info
      FROM iot_hotspot_infos ihi
      INNER JOIN assets_with_updates awu ON awu.asset = ihi.asset
      WHERE $1 = 'iot'
    )
    -- Create atomic data for the found hotspots
    SELECT
      hd.hotspot_type,
      kta.encoded_entity_key as pub_key,
      hd.address as solana_address,
      hd.asset,
      hd.location,
      hd.last_block_height as hotspot_block_height,
      hd.last_block_height as effective_block_height,
      hd.device_type,
      hd.elevation,
      hd.gain,
      -- Ownership information (welcome_pack_owner or direct_owner only)
      CASE
        WHEN wp.owner IS NOT NULL THEN wp.owner
        ELSE ao.owner
      END as owner,
      CASE
        WHEN wp.owner IS NOT NULL THEN 'welcome_pack_owner'
        ELSE 'direct_owner'
      END as owner_type,
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
      -- Compact JSON object with all relevant data
      json_build_object(
        'pub_key', kta.encoded_entity_key,
        'address', hd.address,
        'asset', hd.asset,
        'location', hd.location,
        'block_height', hd.last_block_height,
        'owner', COALESCE(wp.owner, ao.owner),
        'owner_type', CASE
          WHEN wp.owner IS NOT NULL THEN 'welcome_pack_owner'
          ELSE 'direct_owner'
        END,
        'hotspot_type', hd.hotspot_type,
        'device_type', hd.device_type,
        'elevation', hd.elevation,
        'gain', hd.gain,
        'is_full_hotspot', hd.is_full_hotspot,
        -- Pass raw deployment info for parsing in Rust
        'deployment_info', hd.deployment_info,
        'rewards_split', CASE
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
        END
      ) as atomic_data
    FROM hotspot_data hd
    LEFT JOIN key_to_assets kta ON kta.asset = hd.asset
    LEFT JOIN asset_owners ao ON ao.asset = hd.asset
    LEFT JOIN welcome_packs wp ON wp.asset = hd.asset
    LEFT JOIN mini_fanouts mf ON mf.owner = hd.address
    WHERE kta.encoded_entity_key IS NOT NULL
    ORDER BY hd.last_block_height DESC;
  "#;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_query_retrieval() {
    let queries = AtomicHotspotQueries::get_all_queries();
    assert_eq!(queries.len(), 1);
    assert!(queries.contains_key("construct_atomic_hotspots"));
  }

  #[test]
  fn test_batch_query_contains_required_placeholders() {
    let batch_query = AtomicHotspotQueries::get_query("construct_atomic_hotspots").unwrap();

    assert!(
      batch_query.contains("$1"),
      "Batch query missing $1 placeholder for primary keys array"
    );
    assert!(
      batch_query.contains("$2"),
      "Batch query missing $2 placeholder for hotspot type"
    );
  }

  #[test]
  fn test_batch_query_structure() {
    let batch_query = AtomicHotspotQueries::get_query("construct_atomic_hotspots").unwrap();

    // Test that the query has the expected structure for the asset-based approach
    assert!(batch_query.contains("assets_with_updates"));
    assert!(batch_query.contains("hotspot_addresses"));
    assert!(batch_query.contains("INNER JOIN"));
    assert!(batch_query.contains("WHERE asset IS NOT NULL"));
    assert!(batch_query.contains("mf.owner = ao.owner"));
    assert!(batch_query.contains("owner"));
    assert!(batch_query.contains("owner_type"));
    assert!(batch_query.contains("json_build_object"));
  }
}
