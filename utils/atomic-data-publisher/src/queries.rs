use std::collections::HashMap;

pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  pub fn get_all_queries() -> HashMap<String, &'static str> {
    let mut queries = HashMap::new();

    queries.insert(
      "construct_atomic_hotspots".to_string(),
      Self::CONSTRUCT_ATOMIC_HOTSPOTS,
    );

    queries
  }

  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  // Parameters: $1 = hotspot_type (mobile/iot), $2 = last_processed_block_height, $3 = current_solana_block_height
  pub const CONSTRUCT_ATOMIC_HOTSPOTS: &'static str = r#"
    WITH assets_with_updates AS (
      SELECT DISTINCT asset FROM (
        SELECT asset FROM asset_owners
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        SELECT asset FROM key_to_assets
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        SELECT asset FROM recipients
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        SELECT asset FROM mobile_hotspot_infos
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3
        AND $1 = 'mobile'

        UNION ALL

        SELECT asset FROM iot_hotspot_infos
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3
        AND $1 = 'iot'

        UNION ALL

        SELECT asset FROM welcome_packs
        WHERE asset IS NOT NULL
        AND last_block_height > $2 AND last_block_height <= $3

        UNION ALL

        SELECT DISTINCT ao.asset FROM mini_fanouts mf
        INNER JOIN asset_owners ao ON ao.owner = mf.owner
        WHERE mf.last_block_height > $2 AND mf.last_block_height <= $3
        AND ao.asset IS NOT NULL
      ) all_asset_updates
    ),
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
      CASE
        WHEN wp.owner IS NOT NULL THEN wp.owner
        ELSE ao.owner
      END as owner,
      CASE
        WHEN wp.owner IS NOT NULL THEN 'welcome_pack_owner'
        ELSE 'direct_owner'
      END as owner_type,
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
