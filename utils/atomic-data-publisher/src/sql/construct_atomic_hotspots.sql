-- Parameters:
-- $1: hotspot_type - Either 'mobile' or 'iot' to filter for specific hotspot type
-- $2: last_processed_block - The last block that was already processed
-- $3: max_block - The maximum block number to process (exclusive)
--
-- Returns: job_name, atomic_data (JSON)

WITH hotspot_metadata_changes AS (
  SELECT
    mhi.address,
    mhi.asset,
    mhi.last_block,
    mhi.location,
    'mobile' as hotspot_type,
    mhi.device_type,
    NULL as elevation,
    NULL as gain,
    mhi.is_full_hotspot,
    mhi.deployment_info
  FROM mobile_hotspot_infos mhi
  WHERE mhi.asset IS NOT NULL
    AND mhi.last_block > $2
    AND mhi.last_block <= $3
    AND $1 = 'mobile'

  UNION ALL

  SELECT
    ihi.address,
    ihi.asset,
    ihi.last_block,
    ihi.location,
    'iot' as hotspot_type,
    NULL as device_type,
    ihi.elevation,
    ihi.gain,
    ihi.is_full_hotspot,
    NULL::jsonb as deployment_info
  FROM iot_hotspot_infos ihi
  WHERE ihi.asset IS NOT NULL
    AND ihi.last_block > $2
    AND ihi.last_block <= $3
    AND $1 = 'iot'
)
SELECT
  CONCAT('atomic_', hmc.hotspot_type, '_hotspots') as job_name,
  JSON_BUILD_OBJECT(
    'pub_key', encode(kta.entity_key, 'hex'),
    'asset', hmc.asset,
    'address', hmc.address,
    'location', hmc.location,
    'hotspot_type', hmc.hotspot_type,
    'device_type', hmc.device_type,
    'elevation', hmc.elevation,
    'gain', hmc.gain,
    'is_full_hotspot', hmc.is_full_hotspot,
    'deployment_info', hmc.deployment_info,
    'block', hmc.last_block
  ) as atomic_data
FROM hotspot_metadata_changes hmc
INNER JOIN key_to_assets kta ON kta.asset = hmc.asset
WHERE kta.entity_key IS NOT NULL
ORDER BY hmc.last_block DESC;
