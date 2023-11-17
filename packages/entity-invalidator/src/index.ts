import { decodeEntityKey } from "@helium/helium-entity-manager-sdk";
import AWS from "aws-sdk";
import { Op } from "sequelize";
import { IotHotspotInfo, KeyToAsset, MobileHotspotInfo } from "./model";
// @ts-ignore
import {
  CLOUDFLARE_EMAIL,
  CLOUDFLARE_API_KEY,
  CLOUDFLARE_ZONE_ID,
  LOOKBACK_HOURS,
  DOMAIN,
} from "./env";
import { chunks } from "@helium/spl-utils";

// How long to wait to perform next invalidation
const INVALIDATION_WAIT = 1000;
// Cloudflare can only invalidate 30k records per day, so
// 10k records here since we make 3 invalidations per record
const INVALIDATE_ALL_RECORD_THRESHOLD = 10000;
// Headers used across all Cloudflare invalidation requests
const CLOUDFLARE_HEADERS = {
  'X-Auth-Email': CLOUDFLARE_EMAIL as string,
  'X-Auth-Key': CLOUDFLARE_API_KEY as string,
  'Content-Type': 'application/json',
};
// URL used across all Cloudflare invalidation requests
const CLOUDFLARE_API_URL = `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`;


async function run() {
  const date = new Date();
  date.setHours(date.getHours() - LOOKBACK_HOURS);

  // Invalidate metadata-service routes:
  // - /v2/hotspot/:keyToAssetKey
  // - /v1/:keyToAssetKey
  // - /:eccCompact
  // Note that the /v2/hotspots route does not need
  // cache invalidation due to usage of origin response
  // headers preventing caching of non-cacheable assets 
  // (e.g., the end of the result list)
  const limit = 10000;
  let lastId = null;
  let entities;

  const lastIdWhere: any = {};
  const whereClause = {
    [Op.or]: [
      {
        refreshedAt: {
          [Op.gt]: date,
        },
      },
      {
        "$iot_hotspot_info.refreshed_at$": {
          [Op.gt]: date,
        },
      },
      {
        "$mobile_hotspot_info.refreshed_at$": {
          [Op.gt]: date,
        },
      },
    ],
  };
  const totalCount = await KeyToAsset.count({
    where: whereClause,
    include: [
      {
        model: IotHotspotInfo,
        required: false,
      },
      {
        model: MobileHotspotInfo,
        required: false,
      },
    ],
  });
  console.log(`Found ${totalCount} updated records`);

  if (totalCount >= INVALIDATE_ALL_RECORD_THRESHOLD) {
    const arg = {
      purge_everything: true
    };

    await invalidate(arg);

    return;
  }

  let totalProgress = 0;
  const paths: string[] = [];

  do {
    if (lastId) {
      lastIdWhere["address"] = {
        [Op.gt]: lastId,
      };
    }
    entities = await KeyToAsset.findAll({
      where: {
        [Op.and]: [lastIdWhere, whereClause],
      },
      include: [
        {
          model: IotHotspotInfo,
          required: false,
        },
        {
          model: MobileHotspotInfo,
          required: false,
        },
      ],
      limit: limit,
      order: [["address", "ASC"]],
    });

    if (entities.length) {
      entities.forEach((entity) => {
        entity.entityKeyStr = decodeEntityKey(entity.entityKey, {
          [entity.keySerialization.toString()]: {},
        });
      });

      paths.push(...entities.flatMap((entity) => getPaths(entity)));

      lastId = entities[entities.length - 1].address;
      totalProgress += entities.length;
      console.log(`Processed ${totalProgress} / ${totalCount}`);
    }
  } while (entities.length === limit);

  // Split the paths into batches of 30
  const batches = chunks(paths, 30)

  // Process each batch of invalidations
  let i = 0;
  for (const batch of batches) {
    const arg = {
      files: batch
    };

    await invalidate(arg);
    await delay(INVALIDATION_WAIT);
    
    console.log(`Invalidated ${i} / ${batches.length} batches`);
    i++
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPaths(entity: KeyToAsset): string[] {
  const v1 = `${DOMAIN}/v1/${entity.address}`;
  const v2 = `${DOMAIN}/v2/hotspot/${entity.address}`;
  if ((entity.entityKeyStr?.length || 0) >= 200) {
    return [v1, v2];
  }

  return [`${DOMAIN}/${entity.entityKeyStr!}`, v1, v2];
}

async function invalidate(arg: any): Promise<void> {
  try {
    const body = JSON.stringify(arg);

    const response = await fetch(CLOUDFLARE_API_URL, { method: 'POST', headers: CLOUDFLARE_HEADERS, body: body });
    const data = await response.json();

    console.log(data);

    return;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
