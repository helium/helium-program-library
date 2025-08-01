CREATE OR REPLACE VIEW hotspots_ownership AS (
  SELECT
    asset,
    owner,
    destination,
    entity_key,
    encoded_entity_key,
    key_serialization,
    MAX(shares) as shares,
    MAX(total_shares) as total_shares,
    MIN(fixed_amount) as fixed_amount,
    MIN(type) as type,
    bool_or(destination_is_owner) as destination_is_owner
  FROM (
    SELECT
      rr.asset,
      rr.owner,
      rr.destination,
      entity_key,
      encoded_entity_key,
      key_serialization,
      shares,
      total_shares,
      fixed_amount,
      type,
      ao.owner = destination as destination_is_owner
    FROM rewards_recipients rr
    JOIN asset_owners ao ON ao.asset = rr.asset
    UNION ALL
    SELECT
      kta.asset as asset,
      ao.owner as owner,
      ao.owner as destination,
      kta.entity_key as entity_key,
      kta.encoded_entity_key as encoded_entity_key,
      json_value(kta.key_serialization, '$') as key_serialization,
      CASE WHEN r.destination = '11111111111111111111111111111111' THEN 100 ELSE 0 END as shares,
      CASE WHEN r.destination = '11111111111111111111111111111111' THEN 100 ELSE 0 END as total_shares,
      0 as fixed_amount,
      'owner' as type,
      true as destination_is_owner
    FROM key_to_assets kta
    JOIN asset_owners ao ON ao.asset = kta.asset
    LEFT JOIN recipients r ON r.asset = ao.asset
  ) subq
  GROUP BY asset, owner, destination, entity_key, encoded_entity_key, key_serialization
)