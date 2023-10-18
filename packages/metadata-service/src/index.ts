import { Program } from "@coral-xyz/anchor";
import cors from "@fastify/cors";
import Address from "@helium/address/build/Address";
import { decodeEntityKey, init } from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { PublicKey } from "@solana/web3.js";
// @ts-ignore
import { truthy } from "@helium/spl-utils";
import animalHash from "angry-purple-tiger";
import axios from "axios";
import bs58 from "bs58";
import Fastify, { FastifyInstance } from "fastify";
import { SHDW_DRIVE_URL } from "./constants";
import {
  IotHotspotInfo,
  KeyToAsset,
  MobileHotspotInfo,
  sequelize,
} from "./model";
import { provider } from "./solana";

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});
server.get("/health", async () => {
  return { ok: true };
});

let program: Program<HeliumEntityManager>;
server.get<{ Params: { keyToAssetKey: string } }>(
  "/v1/:keyToAssetKey",
  async (request, reply) => {
    program = program || (await init(provider));
    const { keyToAssetKey } = request.params;
    const keyToAsset = new PublicKey(keyToAssetKey);
    const keyToAssetAcc = await program.account.keyToAssetV0.fetch(keyToAsset);
    const { entityKey, keySerialization } = keyToAssetAcc;
    const keyStr = decodeEntityKey(entityKey, keySerialization);
    const digest = animalHash(keyStr);
    const record = await KeyToAsset.findOne({
      where: {
        address: keyToAsset.toBase58(),
      },
      include: [IotHotspotInfo, MobileHotspotInfo],
    });

    // HACK: If it has a long key, it's an RSA key, and this is a mobile hotspot.
    // In the future, we need to put different symbols on different types of hotspots
    const hotspotType = entityKey.length > 100 ? "MOBILE" : "IOT";
    const image = `${SHDW_DRIVE_URL}/${
      hotspotType === "MOBILE"
        ? record?.mobile_hotspot_info?.isActive
          ? "mobile-hotspot-active.png"
          : "mobile-hotspot.png"
        : record?.iot_hotspot_info?.isActive
        ? "hotspot-active.png"
        : "hotspot.png"
    }`;

    return {
      name: keyStr === "iot_operations_fund" ? "IOT Operations Fund" : digest,
      description:
        keyStr === "iot_operations_fund"
          ? "IOT Operations Fund"
          : "A Rewardable NFT on Helium",
      // HACK: If it has a long key, it's an RSA key, and this is a mobile hotspot.
      // In the future, we need to put different symbols on different types of hotspots
      image,
      attributes: [
        keyStr && Address.isValid(keyStr)
          ? { trait_type: "ecc_compact", value: keyStr }
          : undefined,
        { trait_type: "entity_key_string", value: keyStr },
        {
          trait_type: "entity_key",
          value: entityKey.toString("base64"),
        },
        { trait_type: "rewardable", value: true },
        {
          trait_type: "networks",
          value: [
            record?.iot_hotspot_info && "iot",
            record?.mobile_hotspot_info && "mobile",
          ].filter(truthy),
        },
        ...locationAttributes("iot", record?.iot_hotspot_info),
        ...locationAttributes("mobile", record?.mobile_hotspot_info),
      ],
    };
  }
);

server.get<{ Params: { eccCompact: string } }>(
  "/:eccCompact",
  async (request, reply) => {
    const { eccCompact } = request.params;

    // TODO: Remove this once we can update compressed nft metadata
    if (eccCompact?.length === 22) {
      try {
        const { data } = await axios(
          `https://sol.hellohelium.com/api/metadata/${eccCompact}`
        );
        return data;
      } catch (e: any) {
        console.error(e);
      }
    }

    const record = await KeyToAsset.findOne({
      where: {
        entityKey: bs58.decode(eccCompact),
      },
      include: [IotHotspotInfo, MobileHotspotInfo],
    });

    const digest = animalHash(eccCompact);
    const image = `${SHDW_DRIVE_URL}/${
      record?.iot_hotspot_info?.isActive ? "hotspot-active.png" : "hotspot.png"
    }`;

    return {
      name: digest,
      description: "A Hotspot NFT on Helium",
      image,
      attributes: [
        { trait_type: "ecc_compact", value: eccCompact },
        { trait_type: "rewardable", value: true },
        {
          trait_type: "networks",
          value: [
            record?.iot_hotspot_info && "iot",
            record?.mobile_hotspot_info && "mobile",
          ].filter(truthy),
        },
        ...locationAttributes("iot", record?.iot_hotspot_info),
        ...locationAttributes("mobile", record?.mobile_hotspot_info),
      ],
    };
  }
);

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

const start = async () => {
  try {
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS key_to_asset_asset_index ON key_to_assets(asset);
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS iot_hotspot_infos_asset_index ON iot_hotspot_infos(asset);
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mobile_hotspot_infos_asset_index ON mobile_hotspot_infos(asset);
    `);
    await server.listen({ port: 8081, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
