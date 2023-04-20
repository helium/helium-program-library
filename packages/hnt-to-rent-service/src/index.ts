import cors from "@fastify/cors";
import {
  PublicKey
} from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { estimate, fundFees } from "./orca";

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});
server.get("/health", async () => {
  return { ok: true };
});

server.post<{
  Body: { wallet: PublicKey };
}>("/hnt-to-fees", async (request, reply) => {
  const wallet = new PublicKey(request.body.wallet);

  return Buffer.from(
    (await fundFees(wallet)).serialize({ requireAllSignatures: false })
  ).toJSON().data;
});


server.get<{
  Body: { wallet: PublicKey };
}>("/estimate", async (request, reply) => {
  return {
    estimate: await estimate()
  }
});

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
