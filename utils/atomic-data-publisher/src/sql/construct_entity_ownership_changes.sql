-- Parameters:
-- $1: last_processed_block - The last block that was already processed
-- $2: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, atomic_data (JSON)

WITH asset_owner_changes AS (
  SELECT
    ao.asset,
    ao.last_block as block,
    encode(kta.entity_key, 'hex') as pub_key,
    CASE WHEN wp.address IS NOT NULL THEN wp.owner ELSE ao.owner END as owner,
    CASE WHEN wp.address IS NOT NULL THEN 'welcome_pack_owner' ELSE 'direct_owner' END as owner_type,
    'entity_ownership' as change_type
  FROM asset_owners ao
  INNER JOIN key_to_assets kta ON kta.asset = ao.asset
  LEFT JOIN welcome_packs wp ON wp.address = ao.owner
  WHERE kta.entity_key IS NOT NULL
    AND ao.asset IS NOT NULL
    AND ao.owner IS NOT NULL
    AND ao.last_block > $1
    AND ao.last_block <= $2
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
FROM asset_owner_changes
ORDER BY block DESC;
