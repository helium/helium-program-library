import cors from "@fastify/cors";
// @ts-ignore
import animalHash from "angry-purple-tiger";
import { decodeEntityKey, init } from "@helium/helium-entity-manager-sdk"
import { daoKey } from "@helium/helium-sub-daos-sdk";
import Fastify, { FastifyInstance } from "fastify";
import { HNT_MINT } from "@helium/spl-utils";
// @ts-ignore
import bs58 from "bs58";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Program } from "@coral-xyz/anchor";
import { provider } from "./solana"
import Address from "@helium/address/build/Address";
import { PublicKey } from "@solana/web3.js";

const server: FastifyInstance = Fastify({
  logger: true
});
server.register(cors, {
  origin: "*"
});
server.get("/health", async () => {
  return { ok: true };
})

const DAO = daoKey(HNT_MINT)[0];

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
        Address.isValid(keyStr)
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

server.get<{ Params: { eccCompact: string } }>("/:eccCompact", async (request, reply) => {
  const { eccCompact } = request.params;
  // const bufferCompact = Buffer.from(Address.fromB58(eccCompact).publicKey)
  // const [storage] = await hotspotStorageKey(bufferCompact);
  // const assetId = new PublicKey((await provider.connection.getAccountInfo(storage)).data.subarray(8, 8 + 32));
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
});

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
