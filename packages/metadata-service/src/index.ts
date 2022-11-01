import Address from "@helium/address";
import { hotspotCollectionKey, hotspotKey } from "@helium/hotspot-issuance-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  Metadata, PROGRAM_ID as MPL_PID
} from "@metaplex-foundation/mpl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { provider } from "./solana";

const server: FastifyInstance = Fastify({});

server.get("/health", async () => {
  return { ok: true };
})

function removeNullBytes(str: string): string {
  return str
    .split("")
    .filter((char) => char.codePointAt(0))
    .join("");
}
const [subDao] = subDaoKey(new PublicKey(process.env.DNT_MINT!))
const [collection] = hotspotCollectionKey(subDao, process.env.COLLECTION_SYMBOL!);

server.get<{ Params: { eccCompact: string } }>("/:eccCompact", async (request, reply) => {
  const { eccCompact } = request.params;
  const bufferCompact = Buffer.from(Address.fromB58(eccCompact).publicKey)
  const [mint] = await hotspotKey(collection, bufferCompact);
  const metadataKey = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata", "utf-8"), MPL_PID.toBuffer(), mint.toBuffer()],
    MPL_PID
  )[0];
  const metadata = await Metadata.fromAccountAddress(provider.connection, metadataKey);

  return {
    name: removeNullBytes(metadata.data.name),
    description: "A hotspot NFT on Helium",
    image:
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/hotspot.png",
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
