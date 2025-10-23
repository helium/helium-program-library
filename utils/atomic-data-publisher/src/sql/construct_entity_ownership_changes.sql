-- Parameters:
-- $1: last_processed_block - The last block that was already processed
-- $2: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, atomic_data (JSON)

WITH asset_owner_changes AS (
  -- Get asset owner changes in the block range
  SELECT
    ao.asset,
    ao.last_block as block,
    encode(kta.entity_key, 'base64') as pub_key,
    ao.owner,
    'direct_owner' as owner_type,
    'entity_ownership' as change_type
  FROM asset_owners ao
  INNER JOIN key_to_assets kta ON kta.asset = ao.asset
  LEFT JOIN iot_hotspot_infos ihi ON ihi.asset = ao.asset
  LEFT JOIN mobile_hotspot_infos mhi ON mhi.asset = ao.asset
  WHERE (ihi.asset IS NOT NULL OR mhi.asset IS NOT NULL)
    AND kta.entity_key IS NOT NULL
    AND ao.asset IS NOT NULL
    AND ao.owner IS NOT NULL
    AND ao.last_block > $1
    AND ao.last_block <= $2
),
welcome_pack_changes AS (
  -- Get welcome pack owner changes in the block range
  SELECT
    wp.asset,
    wp.last_block as block,
    encode(kta.entity_key, 'base64') as pub_key,
    wp.owner,
    'welcome_pack_owner' as owner_type,
    'entity_ownership' as change_type
  FROM welcome_packs wp
  INNER JOIN key_to_assets kta ON kta.asset = wp.asset
  LEFT JOIN iot_hotspot_infos ihi ON ihi.asset = wp.asset
  LEFT JOIN mobile_hotspot_infos mhi ON mhi.asset = wp.asset
  WHERE (ihi.asset IS NOT NULL OR mhi.asset IS NOT NULL)
    AND kta.entity_key IS NOT NULL
    AND wp.asset IS NOT NULL
    AND wp.owner IS NOT NULL
    AND wp.last_block > $1
    AND wp.last_block <= $2
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
  JSON_BUILD_OBJECT(
    'pub_key', pub_key,
    'asset', asset,
    'owner', owner,
    'owner_type', owner_type,
    'change_type', change_type,
    'block', block
  ) as atomic_data
FROM ownership_changes;
