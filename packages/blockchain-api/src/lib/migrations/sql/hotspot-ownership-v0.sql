CREATE OR REPLACE VIEW hotspot_ownership_v0 AS (
  SELECT
    rr.asset,
    rr.owner as fanout_owner,
    ao.owner as asset_owner,
    rr.destination,
    entity_key,
    encoded_entity_key,
    CAST(rr.key_serialization as TEXT) as key_serialization,
    shares,
    total_shares,
    fixed_amount,
    type,
    ao.owner = destination as destination_is_owner
  FROM
    rewards_recipients rr
  JOIN asset_owners ao ON ao.asset = rr.asset
  UNION ALL
  SELECT
    kta.asset as asset,
    '11111111111111111111111111111111' as fanout_owner,
    ao.owner as asset_owner,
    ao.owner as destination,
    kta.entity_key as entity_key,
    kta.encoded_entity_key as encoded_entity_key,
    CAST(kta.key_serialization as TEXT) as key_serialization,
    CASE
      WHEN r.destination = '11111111111111111111111111111111' THEN 100
      ELSE 0
    END as shares,
    CASE
      WHEN r.destination = '11111111111111111111111111111111' THEN 100
      ELSE 0
    END as total_shares,
    0 as fixed_amount,
    'owner' as type,
    true as destination_is_owner
  FROM
    key_to_assets kta
  JOIN asset_owners ao ON ao.asset = kta.asset
  LEFT OUTER JOIN recipients r ON r.asset = ao.asset AND r.lazy_distributor = '6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq'
  -- Exclude hotspots that have rewards recipients, as they're in the other query.
  LEFT OUTER JOIN rewards_recipients rr ON rr.asset = ao.asset
  AND rr.destination = ao.owner
  WHERE
    rr.owner IS NULL
)
