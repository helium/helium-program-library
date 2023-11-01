import { Program } from "@coral-xyz/anchor";
import cors from "@fastify/cors";
import Address from "@helium/address/build/Address";
import {
  decodeEntityKey,
  entityCreatorKey,
  init,
} from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
// @ts-ignore
import {
  Asset,
  DC_MINT,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  searchAssets,
  truthy,
} from "@helium/spl-utils";
import animalHash from "angry-purple-tiger";
import axios from "axios";
import bs58 from "bs58";
import Fastify, { FastifyInstance } from "fastify";
import { SHDW_DRIVE_URL } from "./constants";
import { IotHotspotInfo, KeyToAsset, MobileHotspotInfo } from "./model";
import { provider } from "./solana";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  AccountLayout,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});
server.get("/health", async () => {
  return { ok: true };
});

server.get<{ Params: { wallet: string } }>(
  "/v2/wallet/:wallet",
  async (request) => {
    const { wallet } = request.params;
    let page = 1;
    const limit = 1000;
    let allAssets: Asset[] = [];

    while (true) {
      const assets =
        (await searchAssets(provider.connection.rpcEndpoint, {
          ownerAddress: wallet,
          creatorVerified: true,
          creatorAddress: entityCreatorKey(daoKey(HNT_MINT)[0])[0].toBase58(),
          page,
          limit,
        })) || [];

      allAssets = allAssets.concat(assets);

      if (assets.length < limit) {
        break;
      }

      page++;
    }

    const assetIds = allAssets.map((a) => a.id);
    const keyToAssets = await KeyToAsset.findAll({
      where: {
        asset: assetIds.map((a) => a.toBase58()),
      },
      include: [IotHotspotInfo, MobileHotspotInfo],
    });

    const assetJsons = keyToAssets.map((record) => {
      const keyStr = decodeEntityKey(record.entityKey, {
        [record.keySerialization]: {},
      });
      return generateAssetJson(record, keyStr!);
    });

    const tokens = [HNT_MINT, MOBILE_MINT, IOT_MINT, DC_MINT];
    const walletPk = new PublicKey(wallet);
    const balances = await Promise.all(
      tokens.map(async (mint) => {
        const account = await provider.connection.getAccountInfo(
          getAssociatedTokenAddressSync(mint, walletPk, true)
        );
        if (account) {
          return {
            mint,
            balance: AccountLayout.decode(account.data).amount.toString(),
          };
        } else {
          return { mint, balance: "0" };
        }
      })
    );

    return {
      hotspots_count: assetJsons.length,
      hotspots: assetJsons,
      balances,
    };
  }
);

server.get<{ Querystring: { subnetwork: string } }>(
  "/v2/hotspots",
  async (request, reply) => {
    const { subnetwork } = request.query;

    if (subnetwork === "iot") {
      const ktas = await KeyToAsset.findAll({
        include: [
          {
            model: IotHotspotInfo,
            required: true,
          },
        ],
      });

      return ktas.map((kta) => {
        return {
          key_to_asset_key: kta.address,
          is_active: kta.iotHotspotInfo!.isActive,
        };
      });
    } else if (subnetwork === "mobile") {
      const ktas = await KeyToAsset.findAll({
        include: [
          {
            model: MobileHotspotInfo,
            required: true,
          },
        ],
      });
      return ktas.map((kta) => {
        return {
          key_to_asset_key: kta.address,
          is_active: kta.mobileHotspotInfo!.isActive,
          device_type: kta.mobileHotspotInfo!.deviceType,
        };
      });
    }

    return reply.code(400).send("Invalid subnetwork");
  }
);

function generateAssetJson(record: KeyToAsset, keyStr: string) {
  const digest = animalHash(keyStr);
  // HACK: If it has a long key, it's an RSA key, and this is a mobile hotspot.
  // In the future, we need to put different symbols on different types of hotspots
  const hotspotType = keyStr.length > 100 ? "MOBILE" : "IOT";
  const image = `${SHDW_DRIVE_URL}/${
    hotspotType === "MOBILE"
      ? record?.mobileHotspotInfo?.isActive
        ? "mobile-hotspot-active.png"
        : "mobile-hotspot.png"
      : record?.iotHotspotInfo?.isActive
      ? "hotspot-active.png"
      : "hotspot.png"
  }`;
  return {
    name: keyStr === "iot_operations_fund" ? "IOT Operations Fund" : digest,
    description:
      keyStr === "iot_operations_fund"
        ? "IOT Operations Fund"
        : "A Rewardable NFT on Helium",
    asset_id: record.asset,
    key_to_asset_key: record.address,
    image,
    hotspot_infos: {
      iot: record?.iotHotspotInfo,
      mobile: record?.mobileHotspotInfo,
    },
    entity_key_b64: record?.entityKey.toString("base64"),
    key_serialization: record?.keySerialization,
    entity_key_str: keyStr,
    attributes: [
      keyStr && Address.isValid(keyStr)
        ? { trait_type: "ecc_compact", value: keyStr }
        : undefined,
      { trait_type: "entity_key_string", value: keyStr },
      {
        trait_type: "entity_key",
        value: record?.entityKey?.toString("base64"),
      },
      { trait_type: "rewardable", value: true },
      {
        trait_type: "networks",
        value: [
          record?.iotHotspotInfo && "iot",
          record?.mobileHotspotInfo && "mobile",
        ].filter(truthy),
      },
      ...locationAttributes("iot", record?.iotHotspotInfo),
      ...locationAttributes("mobile", record?.mobileHotspotInfo),
    ],
  };
}

const getHotspotByKeyToAsset = async (request, reply) => {
  program = program || (await init(provider));
  const { keyToAssetKey } = request.params;
  const record = await KeyToAsset.findOne({
    where: {
      address: keyToAssetKey,
    },
    include: [IotHotspotInfo, MobileHotspotInfo],
  });
  if (!record) {
    return reply.code(404);
  }

  const { entityKey, keySerialization } = record;
  const keyStr = decodeEntityKey(entityKey, { [keySerialization]: {} });

  const assetJson = generateAssetJson(record, keyStr!);
  return assetJson;
};

let program: Program<HeliumEntityManager>;
server.get<{ Params: { keyToAssetKey: string } }>(
  "/v1/:keyToAssetKey",
  getHotspotByKeyToAsset
);

server.get<{ Params: { keyToAssetKey: string } }>(
  "/v2/hotspot/:keyToAssetKey",
  getHotspotByKeyToAsset
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

    if (!record) {
      return reply.code(404);
    }

    const assetJson = generateAssetJson(record, eccCompact);
    return assetJson;
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
    await server.listen({ port: 8081, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
