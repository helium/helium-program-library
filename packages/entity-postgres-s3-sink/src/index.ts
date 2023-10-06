import { decodeEntityKey } from "@helium/helium-entity-manager-sdk";
import AWS from "aws-sdk";
import { Op } from "sequelize";
import { IotHotspotInfo, KeyToAsset, MobileHotspotInfo } from "./model";
// @ts-ignore
import Address from "@helium/address/build/Address";
import { truthy } from "@helium/spl-utils";
import animalHash from "angry-purple-tiger";
import axios from "axios";
import pLimit from "p-limit";
import {
  LOOKBACK_HOURS,
  AWS_REGION,
  MINIO_ACCESS_KEY,
  MINIO_ENDPOINT,
  MINIO_SECRET_KEY,
  S3_BUCKET,
  CLOUDFRONT_DISTRIBUTION,
} from "./env";

async function run() {
  const date = new Date();
  date.setHours(date.getHours() - LOOKBACK_HOURS);
  AWS.config.update({ region: AWS_REGION });
  // Additional configuration for Minio
  let s3;
  if (MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY) {
    // Create a new S3 instance with specific configuration for Minio
    s3 = new AWS.S3({
      endpoint: MINIO_ENDPOINT,
      s3ForcePathStyle: true,
      accessKeyId: MINIO_ACCESS_KEY,
      secretAccessKey: MINIO_SECRET_KEY,
    });
  } else {
    // Create a new S3 instance with default configuration
    s3 = new AWS.S3();
  }

  const cloudfront = new AWS.CloudFront();
  const bucket = S3_BUCKET;

  const limit = 10000;
  let lastId = null;
  let entities;
  const promiseLimit = pLimit(50);

  const lastIdWhere = {};
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
      await Promise.all(
        entities.map((entity) => {
          return promiseLimit(async () => {
            await uploadToS3({
              s3,
              bucket,
              entity,
            });
          });
        })
      );

      if (CLOUDFRONT_DISTRIBUTION) {
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
      }

      lastId = entities[entities.length - 1].id;
      totalProgress += entities.length;
      console.log(`Processed ${totalProgress} / ${totalCount}`);
    }
  } while (entities.length === limit);
}

function getPaths(entity: KeyToAsset): string[] {
  const v1 = `v1/${entity.address}`;
  if ((entity.entityKeyStr?.length || 0) >= 200) {
    return [v1];
  }

  return [entity.entityKeyStr!, v1];
}

async function uploadToS3({
  s3,
  entity,
  bucket,
}: {
  s3: AWS.S3;
  entity: KeyToAsset;
  bucket: string;
}): Promise<void> {
  const keyStr = entity.entityKeyStr;
  const digest = animalHash(keyStr);
  let json;
  if (keyStr?.length === 22) {
    try {
      const { data } = await axios(
        `https://sol.hellohelium.com/api/metadata/${keyStr}`
      );
      json = data;
    } catch (e: any) {
      console.log(`Failed to fetch mobile subscriber ${keyStr}`)
      return;
    }
  } else {
    json = {
      name: keyStr === "iot_operations_fund" ? "IOT Operations Fund" : digest,
      description:
        keyStr === "iot_operations_fund"
          ? "IOT Operations Fund"
          : "A Rewardable NFT on Helium",
      // HACK: If it has a long key, it's an RSA key, and this is a mobile hotspot.
      // In the future, we need to put different symbols on different types of hotspots
      image:
        entity.entityKey.length > 100
          ? "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/mobile-hotspot.png"
          : "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/hotspot.png",
      attributes: [
        keyStr && Address.isValid(keyStr)
          ? { trait_type: "ecc_compact", value: keyStr }
          : undefined,
        { trait_type: "entity_key_string", value: keyStr },
        { trait_type: "rewardable", value: true },
        {
          trait_type: "networks",
          value: [
            entity?.iot_hotspot_info && "iot",
            entity?.mobile_hotspot_info && "mobile",
          ].filter(truthy),
        },
        ...locationAttributes("iot", entity?.iot_hotspot_info),
        ...locationAttributes("mobile", entity?.mobile_hotspot_info),
      ],
      entity_key_string: keyStr,
      entity_key_b64: entity.entityKey.toString("base64"),
      key_to_asset_key: entity.address,
      iot_hotspot_info: entity.iot_hotspot_info?.dataValues,
      mobile_hotspot_info: entity.mobile_hotspot_info?.dataValues,
    };
  }

  for (const path of getPaths(entity)) {
    await s3
      .upload({
        Bucket: bucket,
        Key: path,
        Body: JSON.stringify(json),
        ContentType: "application/json",
      })
      .promise();
  }
}

function locationAttributes(
  name: string,
  info: MobileHotspotInfo | IotHotspotInfo | undefined
) {
  if (!info) {
    return [];
  }

  return [
    { trait_type: `${name}_city`, value: info.city },
    { trait_type: `${name}_state`, value: info.state },
    { trait_type: `${name}_country`, value: info.country },
  ];
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
