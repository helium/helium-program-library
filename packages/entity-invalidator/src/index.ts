import { decodeEntityKey } from "@helium/helium-entity-manager-sdk";
import AWS from "aws-sdk";
import { Op } from "sequelize";
import { v4 as uuidv4 } from 'uuid';
import { IotHotspotInfo, KeyToAsset, MobileHotspotInfo } from "./model";
// @ts-ignore
import { AWS_REGION, CLOUDFRONT_DISTRIBUTION, LOOKBACK_HOURS, DOMAIN } from "./env";

async function run() {
  const date = new Date();
  date.setHours(date.getHours() - LOOKBACK_HOURS);
  AWS.config.update({ region: AWS_REGION });
  const cloudfront = new AWS.CloudFront();

  // Invalidate metadata-service routes: 
  // - /v2/hotspots/pagination-metadata?subnetwork=iot
  // - /v2/hotspots/pagination-metadata?subnetwork=mobile
  // Or /v2/hotspot* if there is an error
  try {
    const modelMap: any = {
      'iot': IotHotspotInfo,
      'mobile': MobileHotspotInfo,
    }
    const subnetworks = ['iot', 'mobile'];

    // Fetch pagination data
    const responsePromises = subnetworks.map((subnetwork) => {
      return fetch(`https://${DOMAIN}/v2/hotspots/pagination-metadata?subnetwork=${subnetwork}`);
    });
    const jsonPromises = await Promise.all(responsePromises);
    const paginationMetadata = await Promise.all(jsonPromises.map((response) => response.json()));
    console.log("Fetched pagination metadata for subnetworks");
    console.log(paginationMetadata);

    // Fetch counts of newly added hotspots 
    const totalCountPromises = subnetworks.map((subnetwork) => {
      const whereClause = {
        created_at: {
          [Op.gte]: date,
        },
      };

      return KeyToAsset.count({
        where: whereClause,
        include: [
          {
            model: modelMap[subnetwork],
            required: true,
          },
        ],
      });
    });
    const totalCounts = await Promise.all(totalCountPromises);
    console.log("Fetched counts of newly added hotspots");
    console.log(totalCounts);

    // Prepare invalidation paths 
    const paths: string[] = [];
    totalCounts.forEach((count, i) => {
      const subnetwork = subnetworks[i];
      const countToPageSizeRatio = count / paginationMetadata[i].pageSize;
      let numOfPagesToInvalidate = Math.ceil(countToPageSizeRatio);
      while (numOfPagesToInvalidate >= 0) {
        const page = paginationMetadata[i].totalPages - numOfPagesToInvalidate;
        if (page > 0) {
          const path = `/v2/hotspots?subnetwork=${subnetwork}&page=${page}`;
          paths.push(path);
        }
        numOfPagesToInvalidate--;
      }
    });
    console.log("Invalidation paths");
    console.log(paths);

    await cloudfront
      .createInvalidation({
        DistributionId: CLOUDFRONT_DISTRIBUTION,
        InvalidationBatch: {
          CallerReference: `${uuidv4()}`,
          Paths: {
            Quantity: paths.length,
            Items: paths,
          },
        },
      })
      .promise();
  } catch (err) {
    console.error("Granular /v2/hotspots invalidation failed, resorting to full invalidation");
    console.error(err);

    await cloudfront
      .createInvalidation({
        DistributionId: CLOUDFRONT_DISTRIBUTION,
        InvalidationBatch: {
          CallerReference: `${uuidv4()}`,
          Paths: {
            Quantity: 1,
            Items: ["/v2/hotspots*"],
          },
        },
      })
      .promise();
  }

  // Invalidate metadata-service routes:
  // - /v2/hotspot/:keyToAssetKey
  // - /v1/:keyToAssetKey 
  // - /:eccCompact
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
  let totalProgress = 0;

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

      const paths = entities.flatMap((entity) => getPaths(entity));
      await cloudfront
        .createInvalidation({
          DistributionId: CLOUDFRONT_DISTRIBUTION,
          InvalidationBatch: {
            CallerReference: `${uuidv4()}`, // unique identifier for this invalidation batch
            Paths: {
              Quantity: paths.length,
              Items: paths,
            },
          },
        })
        .promise();

      lastId = entities[entities.length - 1].address;
      totalProgress += entities.length;
      console.log(`Processed ${totalProgress} / ${totalCount}`);
    }
  } while (entities.length === limit);
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
