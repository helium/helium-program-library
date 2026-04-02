-- Parameters:
-- $1: last_processed_block
-- $2: max_block
--
-- Publishes WelcomePackOwner when welcome_packs is indexed.
-- INNER JOINs ensure we only publish when:
--   1. asset_owners exists for the welcome pack (ao.owner = wp.address)
--   2. The asset has a valid entity key
-- If asset_owners hasn't been indexed yet, the INNER JOIN produces no rows
-- and nothing is published — the main ownership job handles it when ao catches up.

WITH welcome_pack_ownership AS (
  SELECT
    ao.asset,
    wp.last_block as block,
    encode(kta.entity_key, 'hex') as pub_key,
    wp.owner as owner,
    'welcome_pack_owner' as owner_type,
    'entity_ownership' as change_type
  FROM welcome_packs wp
  INNER JOIN asset_owners ao ON ao.owner = wp.address
  INNER JOIN key_to_assets kta ON kta.asset = ao.asset
  WHERE kta.entity_key IS NOT NULL
    AND kta.key_serialization = '"b58"'
    AND ao.asset IS NOT NULL
    AND wp.last_block > $1
    AND wp.last_block <= $2
)
SELECT
  'welcome_pack_ownership' as job_name,
  JSON_BUILD_OBJECT(
    'pub_key', pub_key,
    'asset', asset,
    'owner', owner,
    'owner_type', owner_type,
    'change_type', change_type,
    'block', block
  ) as atomic_data
FROM welcome_pack_ownership
ORDER BY block DESC;
