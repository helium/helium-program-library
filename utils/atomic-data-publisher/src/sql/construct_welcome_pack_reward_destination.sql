-- Parameters:
-- $1: last_processed_block
-- $2: max_block
--
-- Publishes correct reward destination when welcome_packs is indexed.
-- Same INNER JOIN guard as ownership query.
-- Includes full rewards_split data via mini_fanout join.
-- Applies same recipient filter as main query: only publishes when no explicit
-- recipient is set (r.asset IS NULL or destination is system program).

WITH welcome_pack_reward_destinations AS (
  SELECT
    kta.asset as asset,
    wp.last_block as block,
    encode(kta.entity_key, 'hex') as pub_key,
    wp.owner as rewards_recipient,
    CASE WHEN mf.address IS NULL THEN NULL::json ELSE JSON_BUILD_OBJECT(
      'pub_key', mf.address,
      'schedule', mf.schedule,
      'total_shares', (
        SELECT COALESCE(SUM((share_item->'share'->'share'->>'amount')::int), 0)
        FROM unnest(mf.shares) AS share_item
      ),
      'recipients', (
        SELECT jsonb_agg(
          JSON_BUILD_OBJECT(
            'authority', mf.owner,
            'recipient', share_item->>'wallet',
            'shares', (share_item->'share'->'share'->>'amount')::int
          )
        )
        FROM unnest(mf.shares) AS share_item
      )
    ) END as rewards_split,
    'entity_reward_destination' as change_type
  FROM welcome_packs wp
  INNER JOIN asset_owners ao ON ao.owner = wp.address
  INNER JOIN key_to_assets kta ON kta.asset = ao.asset
  LEFT OUTER JOIN recipients r ON r.asset = ao.asset
    AND r.lazy_distributor = '6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq'
  LEFT OUTER JOIN mini_fanouts mf ON mf.address = r.destination
  WHERE kta.entity_key IS NOT NULL
    AND kta.key_serialization = '"b58"'
    AND kta.asset IS NOT NULL
    AND ao.owner IS NOT NULL
    AND wp.last_block > $1
    AND wp.last_block <= $2
    AND (r.asset IS NULL OR r.destination = '11111111111111111111111111111111')
)
SELECT
  'welcome_pack_reward_destination' as job_name,
  JSON_BUILD_OBJECT(
    'pub_key', pub_key,
    'asset', asset,
    'rewards_recipient', CASE WHEN rewards_split IS NULL THEN rewards_recipient ELSE NULL END,
    'rewards_split', rewards_split,
    'change_type', change_type,
    'block', block
  ) as atomic_data
FROM welcome_pack_reward_destinations
ORDER BY block DESC;
