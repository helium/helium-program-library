import { decodeEntityKey } from "@helium/helium-entity-manager-sdk";
import AWS from "aws-sdk";
import { Op } from "sequelize";
import { IotHotspotInfo, KeyToAsset, MobileHotspotInfo } from "./model";
// @ts-ignore
import { AWS_REGION, CLOUDFRONT_DISTRIBUTION, LOOKBACK_HOURS } from "./env";

async function run() {
  const date = new Date();
  date.setHours(date.getHours() - LOOKBACK_HOURS);
  AWS.config.update({ region: AWS_REGION });
  const cloudfront = new AWS.CloudFront();

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
            CallerReference: `${new Date().getTime()}`, // unique identifier for this invalidation batch
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
  if ((entity.entityKeyStr?.length || 0) >= 200) {
    return [v1];
  }

  return [`/${entity.entityKeyStr!}`, v1];
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
