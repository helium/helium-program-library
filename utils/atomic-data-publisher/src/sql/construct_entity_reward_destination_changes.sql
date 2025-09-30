-- Parameters:
-- $1: last_processed_block - The last block that was already processed
-- $2: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, block, solana_address, asset, atomic_data (JSON)

WITH updates AS (
  SELECT
  kta.asset as asset,
  GREATEST(COALESCE(ao.last_block, 0), COALESCE(r.last_block, 0), COALESCE(mf.last_block, 0)) as block,
  kta.encoded_entity_key as pub_key,
  ao.owner as rewards_recipient,
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
FROM
  key_to_assets kta
  JOIN asset_owners ao ON ao.asset = kta.asset
  LEFT OUTER JOIN recipients r ON r.asset = ao.asset
  AND r.lazy_distributor = '6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq' -- Exclude hotspots that have rewards recipients, as they're in the other query.
  LEFT OUTER JOIN mini_fanouts mf ON mf.address = r.destination
  WHERE
    (
      (
        ao.last_block > $1
        AND ao.last_block <= $2
      )
      OR (
        r.last_block > $1
        AND r.last_block <= $2
      )
      OR (
        mf.last_block > $1
        AND mf.last_block <= $2
      )
    )
    -- AND ((ao.last_block > $1 AND ao.last_block <= $2) OR (r.last_block > $1 AND r.last_block <= $2))
)
SELECT
  'entity_reward_destination_changes' as job_name,
  block,
  pub_key as solana_address,
  asset,
  JSON_BUILD_OBJECT(
    'pub_key', pub_key,
    'asset', asset,
    'rewards_recipient', CASE WHEN rewards_split IS NULL THEN rewards_recipient ELSE NULL END,
    'rewards_split', rewards_split,
    'change_type', change_type,
    'block', block
  ) as atomic_data
FROM updates
ORDER BY block DESC;
