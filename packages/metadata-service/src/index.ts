import { Program } from "@coral-xyz/anchor";
import cors from "@fastify/cors";
import Address from "@helium/address/build/Address";
import { decodeEntityKey, init } from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { PublicKey } from "@solana/web3.js";
// @ts-ignore
import animalHash from "angry-purple-tiger";
import Fastify, { FastifyInstance } from "fastify";
import axios from "axios";
import { provider } from "./solana";
import {
  IotHotspotInfo,
  KeyToAsset,
  MobileHotspotInfo,
  sequelize,
} from "./model";
import bs58 from "bs58";
import { truthy } from "@helium/spl-utils";

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
    const { keyToAssetKey } = request.params;
    const keyToAsset = new PublicKey(keyToAssetKey);
    if (!program) {
      program = await init(provider);
    }
    const keyToAssetAccount = await program.account.keyToAssetV0.fetch(
      keyToAsset
    );
    const keyStr = decodeEntityKey(
      keyToAssetAccount.entityKey,
      keyToAssetAccount.keySerialization
    );
    const digest = animalHash(keyStr);
    const record = await KeyToAsset.findOne({
      where: {
        address: keyToAsset.toBase58(),
      },
      include: [IotHotspotInfo, MobileHotspotInfo],
    });

    return {
      name: keyStr === "iot_operations_fund" ? "IOT Operations Fund" : digest,
      description:
        keyStr === "iot_operations_fund"
          ? "IOT Operations Fund"
          : "A Rewardable NFT on Helium",
      // HACK: If it has a long key, it's an RSA key, and this is a mobile hotspot.
      // In the future, we need to put different symbols on different types of hotspots
      image:
        keyToAssetAccount.entityKey.length > 100
          ? "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/mobile-hotspot.png"
          : "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/hotspot.png",
      attributes: [
        keyStr && Address.isValid(keyStr)
          ? { trait_type: "ecc_compact", value: keyStr }
          : undefined,
        { trait_type: "entity_key_string", value: keyStr },
        {
          trait_type: "entity_key",
          value: keyToAssetAccount.entityKey.toString("base64"),
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

    return {
      name: digest,
      description: "A Hotspot NFT on Helium",
      image:
        "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/hotspot.png",
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
      ]
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
