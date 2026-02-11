-- Parameters:
-- $1: last_processed_block - The last block that was already processed
-- $2: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, atomic_data (JSON)

WITH asset_owner_changes AS (
  -- Get asset owner changes in the block range
  -- If owner is a welcome pack PDA, resolve to the wallet owner and mark as welcome_pack_owner
  SELECT
    ao.asset,
    ao.last_block as block,
    encode(kta.entity_key, 'hex') as pub_key,
    CASE WHEN wp.address IS NOT NULL THEN wp.owner ELSE ao.owner END as owner,
    CASE WHEN wp.address IS NOT NULL THEN 'welcome_pack_owner' ELSE 'direct_owner' END as owner_type,
    'entity_ownership' as change_type
  FROM asset_owners ao
  INNER JOIN key_to_assets kta ON kta.asset = ao.asset
  LEFT JOIN iot_hotspot_infos ihi ON ihi.asset = ao.asset
  LEFT JOIN mobile_hotspot_infos mhi ON mhi.asset = ao.asset
  LEFT JOIN welcome_packs wp ON wp.address = ao.owner
  WHERE (ihi.asset IS NOT NULL OR mhi.asset IS NOT NULL)
    AND kta.entity_key IS NOT NULL
    AND ao.asset IS NOT NULL
    AND ao.owner IS NOT NULL
    AND ao.last_block > $1
    AND ao.last_block <= $2
),
hotspots_onboarded_in_range AS (
  -- Get hotspots onboarded in this block range
  SELECT asset, last_block FROM iot_hotspot_infos WHERE last_block > $1 AND last_block <= $2
  UNION ALL
  SELECT asset, last_block FROM mobile_hotspot_infos WHERE last_block > $1 AND last_block <= $2
),
newly_onboarded_hotspots AS (
  -- Catch entities that were issued before this block range but onboarded as hotspots within it
  -- This handles the race condition where IssueEntity and OnboardHotspot happen in different blocks
  SELECT
    hs.asset,
    hs.last_block as block,
    encode(kta.entity_key, 'hex') as pub_key,
    CASE WHEN wp.address IS NOT NULL THEN wp.owner ELSE ao.owner END as owner,
    CASE WHEN wp.address IS NOT NULL THEN 'welcome_pack_owner' ELSE 'direct_owner' END as owner_type,
    'entity_ownership' as change_type
  FROM hotspots_onboarded_in_range hs
  INNER JOIN key_to_assets kta ON kta.asset = hs.asset
  INNER JOIN asset_owners ao ON ao.asset = hs.asset
  LEFT JOIN welcome_packs wp ON wp.address = ao.owner
  WHERE kta.entity_key IS NOT NULL
    AND ao.owner IS NOT NULL
    -- Asset owner was set before this block range (race condition case)
    AND ao.last_block <= $1
),
welcome_pack_changes AS (
  -- Detect welcome pack creation/update when asset_owners hasn't caught up yet.
  -- Covers the race condition where account-postgres-sink-service (welcome_packs)
  -- processes faster than asset-ownership-service (asset_owners).
  SELECT
    wp.asset,
    wp.last_block as block,
    encode(kta.entity_key, 'hex') as pub_key,
    wp.owner as owner,
    'welcome_pack_owner' as owner_type,
    'entity_ownership' as change_type
  FROM welcome_packs wp
  INNER JOIN key_to_assets kta ON kta.asset = wp.asset
  INNER JOIN asset_owners ao ON ao.asset = wp.asset
  LEFT JOIN iot_hotspot_infos ihi ON ihi.asset = wp.asset
  LEFT JOIN mobile_hotspot_infos mhi ON mhi.asset = wp.asset
  WHERE (ihi.asset IS NOT NULL OR mhi.asset IS NOT NULL)
    AND kta.entity_key IS NOT NULL
    AND ao.owner IS NOT NULL
    AND wp.last_block > $1
    AND wp.last_block <= $2
    -- Only when asset_owners wasn't also updated in this range
    -- (asset_owner_changes CTE already handles that case with welcome_pack resolution)
    AND ao.last_block <= $1
),
ownership_changes AS (
  SELECT asset, block, pub_key, owner, owner_type, change_type
  FROM asset_owner_changes
  UNION ALL
  SELECT asset, block, pub_key, owner, owner_type, change_type
  FROM newly_onboarded_hotspots
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
FROM ownership_changes
ORDER BY block DESC;
