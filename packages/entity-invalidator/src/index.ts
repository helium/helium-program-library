import { decodeEntityKey } from "@helium/helium-entity-manager-sdk";
import AWS from "aws-sdk";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { IotHotspotInfo, KeyToAsset, MobileHotspotInfo } from "./model";
// @ts-ignore
import {
  AWS_REGION,
  CLOUDFRONT_DISTRIBUTION,
  LOOKBACK_HOURS,
  INVALIDATE_ALL_RECORD_THRESHOLD,
} from "./env";
import { chunks } from "@helium/spl-utils";

// How long to wait to check invalidation status again
const INVALIDATION_WAIT = 10000;
// 30 minutes
const INVALIDATION_WAIT_LIMIT = 30 * 60 * 1000;

async function run() {
  const date = new Date();
  date.setHours(date.getHours() - LOOKBACK_HOURS);
  AWS.config.update({ region: AWS_REGION });
  const cloudfront = new AWS.CloudFront();

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
    await invalidateAndWait({
      cloudfront,
      DistributionId: CLOUDFRONT_DISTRIBUTION,
      Paths: {
        Quantity: 1,
        Items: ["/*"],
      },
    });

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

  // Split the paths into batches of 3000
  const batches = chunks(paths, 3000)

  // Process each batch of invalidations
  let i = 0;
  for (const batch of batches) {
    await invalidateAndWait({
      cloudfront,
      DistributionId: CLOUDFRONT_DISTRIBUTION,
      Paths: {
        Quantity: batch.length,
        Items: batch,
      },
    })
    
    console.log(`Invalidated ${i} / ${batches.length} batches`);
    i++
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invalidateAndWait({
  cloudfront,
  DistributionId,
  Paths,
}: {
  cloudfront: AWS.CloudFront,
  DistributionId: string,
  Paths: {
    Quantity: number;
    Items: string[]
  }
}) {
  const invalidationResponse = await cloudfront
    .createInvalidation({
      DistributionId,
      InvalidationBatch: {
        CallerReference: `${uuidv4()}`,
        Paths,
      },
    })
    .promise();

  if (invalidationResponse?.Invalidation) {
    const invalidationId = invalidationResponse.Invalidation.Id;

    // Check the status of the invalidation batch periodically
    let invalidationStatus = await getInvalidationStatus(
      cloudfront,
      invalidationId
    );
    let totalWait = 0;
    while (invalidationStatus !== "Completed") {
      console.log("Invalidation in progress. Waiting for completion...");
      totalWait += INVALIDATION_WAIT
      await delay(INVALIDATION_WAIT); // Wait for 10 seconds before checking the status again
      invalidationStatus = await getInvalidationStatus(
        cloudfront,
        invalidationId
      );

      if (totalWait > INVALIDATION_WAIT_LIMIT) {
        throw new Error("Exceeded invalidation wait limit")
      }
    }
  }
}

async function getInvalidationStatus(cloudfront: AWS.CloudFront, invalidationId: string) {
  const invalidationResponse = await cloudfront
    .getInvalidation({
      DistributionId: CLOUDFRONT_DISTRIBUTION,
      Id: invalidationId,
    })
    .promise();

  return invalidationResponse?.Invalidation?.Status;
}

function getPaths(entity: KeyToAsset): string[] {
  const v1 = `/v1/${entity.address}`;
  const v2 = `/v2/hotspot/${entity.address}`;
  if ((entity.entityKeyStr?.length || 0) >= 200) {
    return [v1, v2];
  }

  return [`/${entity.entityKeyStr!}`, v1, v2];
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
