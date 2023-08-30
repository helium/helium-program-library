import cors from "@fastify/cors";
// @ts-ignore
import animalHash from "angry-purple-tiger";
import {
  decodeEntityKey,
  init,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import Fastify, { FastifyInstance } from "fastify";
import { getAsset, HNT_MINT } from "@helium/spl-utils";
// @ts-ignore
import bs58 from "bs58";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Program } from "@coral-xyz/anchor";
import { provider } from "./solana";
import Address from "@helium/address/build/Address";
import { PublicKey } from "@solana/web3.js";
import axios from "axios";

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

    return {
      name: digest,
      description:
        keyStr === "iot_operations_fund"
          ? "IOT Operations Fund"
          : "A Rewardable NFT on Helium",
      image:
        "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/hotspot.png",
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
      ],
    };
  }
);

server.get<{ Params: { eccCompact: string } }>(
  "/:eccCompact",
  async (request, reply) => {
    const { eccCompact } = request.params;

    // TODO: Remove this once we can update compressed nft metadata
    try {
      if (!program) {
        program = await init(provider);
      }

      const [keyToAssetK] = keyToAssetKey(
        daoKey(HNT_MINT)[0],
        eccCompact,
        "b58"
      );

      const keyToAsset = await program.account.keyToAssetV0.fetchNullable(
        keyToAssetK
      );

      const asset = await getAsset(
        provider.connection.rpcEndpoint,
        keyToAsset!.asset
      );

      // If the asset is a subscriber, fetch the metadata from helium mobile metadata service
      if (asset?.content?.metadata?.symbol === "SUBSCRIBER") {
        const { data } = await axios(
          `https://sol.hellohelium.com/api/metadata/${eccCompact}`
        );
        return data;
      }
    } catch {
      // ignore
    }

    const digest = animalHash(eccCompact);

    return {
      name: digest,
      description: "A Hotspot NFT on Helium",
      image:
        "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/hotspot.png",
      attributes: [
        { trait_type: "ecc_compact", value: eccCompact },
        { trait_type: "rewardable", value: true },
      ],
    };
  }
);

const start = async () => {
  try {
    await server.listen({ port: 8081, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
