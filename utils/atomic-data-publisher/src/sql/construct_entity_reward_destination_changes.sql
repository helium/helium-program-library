-- Parameters:
-- $1: last_processed_block - The last block that was already processed
-- $2: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, atomic_data (JSON)

WITH asset_reward_destination_changes AS (
  SELECT
  kta.asset as asset,
  GREATEST(COALESCE(ao.last_block, 0), COALESCE(r.last_block, 0), COALESCE(mf.last_block, 0)) as block,
  encode(kta.entity_key, 'hex') as pub_key,
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
  LEFT JOIN iot_hotspot_infos ihi ON ihi.asset = kta.asset
  LEFT JOIN mobile_hotspot_infos mhi ON mhi.asset = kta.asset
  LEFT OUTER JOIN recipients r ON r.asset = ao.asset
  AND r.lazy_distributor = '6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq' -- Exclude hotspots that have rewards recipients, as they're in the other query.
  LEFT OUTER JOIN mini_fanouts mf ON mf.address = r.destination
  WHERE
    (ihi.asset IS NOT NULL OR mhi.asset IS NOT NULL)
    AND kta.entity_key IS NOT NULL
    AND kta.asset IS NOT NULL
    AND ao.owner IS NOT NULL
    AND (
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
),
hotspots_onboarded_in_range AS (
  -- Get hotspots onboarded in this block range
  SELECT asset, last_block FROM iot_hotspot_infos WHERE last_block > $1 AND last_block <= $2
  UNION ALL
  SELECT asset, last_block FROM mobile_hotspot_infos WHERE last_block > $1 AND last_block <= $2
),
newly_onboarded_hotspots AS (
  -- Catch entities that had reward destinations set before hotspot onboarding
  -- This handles the race condition where IssueEntity and OnboardHotspot happen in different blocks
  SELECT
  hs.asset as asset,
  hs.last_block as block,
  encode(kta.entity_key, 'hex') as pub_key,
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
  hotspots_onboarded_in_range hs
  INNER JOIN key_to_assets kta ON kta.asset = hs.asset
  INNER JOIN asset_owners ao ON ao.asset = hs.asset
  LEFT OUTER JOIN recipients r ON r.asset = ao.asset
    AND r.lazy_distributor = '6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq'
  LEFT OUTER JOIN mini_fanouts mf ON mf.address = r.destination
  WHERE
    kta.entity_key IS NOT NULL
    AND ao.owner IS NOT NULL
    -- Reward destination state was set before this block range (race condition case)
    AND GREATEST(COALESCE(ao.last_block, 0), COALESCE(r.last_block, 0), COALESCE(mf.last_block, 0)) <= $1
),
reward_destination_changes AS (
  SELECT asset, block, pub_key, rewards_recipient, rewards_split, change_type
  FROM asset_reward_destination_changes
  UNION ALL
  SELECT asset, block, pub_key, rewards_recipient, rewards_split, change_type
  FROM newly_onboarded_hotspots
)
SELECT
  'entity_reward_destination_changes' as job_name,
  JSON_BUILD_OBJECT(
    'pub_key', pub_key,
    'asset', asset,
    'rewards_recipient', CASE WHEN rewards_split IS NULL THEN rewards_recipient ELSE NULL END,
    'rewards_split', rewards_split,
    'change_type', change_type,
    'block', block
  ) as atomic_data
FROM reward_destination_changes
ORDER BY block DESC;
