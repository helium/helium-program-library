import cors from "@fastify/cors";
// @ts-ignore
import animalHash from "angry-purple-tiger";
import Fastify, { FastifyInstance } from "fastify";

const server: FastifyInstance = Fastify({
  logger: true
});
server.register(cors, {
  origin: "*"
});
server.get("/health", async () => {
  return { ok: true };
})

server.get<{ Params: { eccCompact: string } }>("/:eccCompact", async (request, reply) => {
  const { eccCompact } = request.params;
  // const bufferCompact = Buffer.from(Address.fromB58(eccCompact).publicKey)
  // const [storage] = await hotspotStorageKey(bufferCompact);
  // const assetId = new PublicKey((await provider.connection.getAccountInfo(storage)).data.subarray(8, 8 + 32));
  const digest = animalHash(eccCompact);

  return {
    name: digest,
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
