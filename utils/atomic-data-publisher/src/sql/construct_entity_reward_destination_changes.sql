-- Parameters:
-- $1: last_processed_block - The last block that was already processed
-- $2: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, block, solana_address, asset, atomic_data (JSON)

WITH direct_recipient_changes AS (
  -- Get direct recipient changes in the block range
  SELECT
    r.asset,
    r.last_block as block,
    kta.encoded_entity_key as pub_key,
    r.destination as rewards_recipient,
    NULL::text as rewards_split_data,
    'entity_reward_destination' as change_type
  FROM recipients r
  INNER JOIN key_to_assets kta ON kta.asset = r.asset
  WHERE r.last_block > $1
    AND r.last_block <= $2
    AND kta.encoded_entity_key IS NOT NULL
    AND r.asset IS NOT NULL
    AND r.destination IS NOT NULL
),
fanout_recipient_changes AS (
  -- Get fanout recipient changes in the block range
  SELECT
    rr.asset,
    rr.last_block as block,
    rr.encoded_entity_key as pub_key,
    rr.destination as rewards_recipient,
    JSON_BUILD_OBJECT(
      'owner', rr.owner,
      'destination', rr.destination,
      'shares', rr.shares,
      'total_shares', rr.total_shares,
      'fixed_amount', rr.fixed_amount,
      'type', rr.type
    )::text as rewards_split_data,
    'entity_reward_destination' as change_type
  FROM rewards_recipients rr
  WHERE rr.last_block > $1
    AND rr.last_block <= $2
    AND rr.encoded_entity_key IS NOT NULL
    AND rr.asset IS NOT NULL
    AND rr.destination IS NOT NULL
    AND rr.type = 'fanout'
),
direct_with_fanout_updates AS (
  -- Update direct recipients with fanout data if available
  SELECT
    drc.asset,
    GREATEST(drc.block, COALESCE(frc.block, 0)) as block,
    drc.pub_key,
    drc.rewards_recipient,
    COALESCE(frc.rewards_split_data, NULL::text) as rewards_split_data,
    drc.change_type
  FROM direct_recipient_changes drc
  LEFT JOIN fanout_recipient_changes frc ON frc.asset = drc.asset
),
fanout_only_changes AS (
  -- Get fanout-only changes (no direct recipient exists)
  SELECT
    frc.asset,
    frc.block,
    frc.pub_key,
    frc.rewards_recipient,
    frc.rewards_split_data,
    frc.change_type
  FROM fanout_recipient_changes frc
  WHERE NOT EXISTS (
    SELECT 1 FROM direct_recipient_changes drc WHERE drc.asset = frc.asset
  )
),
reward_destination_changes AS (
  SELECT asset, block, pub_key, rewards_recipient, rewards_split_data, change_type
  FROM direct_with_fanout_updates
  UNION ALL
  SELECT asset, block, pub_key, rewards_recipient, rewards_split_data, change_type
  FROM fanout_only_changes
)
SELECT
  'entity_reward_destination_changes' as job_name,
  block,
  pub_key as solana_address,
  asset,
  JSON_BUILD_OBJECT(
    'pub_key', pub_key,
    'asset', asset,
    'rewards_recipient', rewards_recipient,
    'rewards_split_data', rewards_split_data,
    'change_type', change_type,
    'block', block
  ) as atomic_data
FROM reward_destination_changes
ORDER BY block DESC;
