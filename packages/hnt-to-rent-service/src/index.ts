import cors from "@fastify/cors";
import {
  PublicKey
} from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { estimate, fundFeesFromHnt, fundFeesFromTokens } from "./orca";

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});
server.get("/health", async () => {
  return { ok: true };
});
import {
  HNT_MINT, IOT_MINT, MOBILE_MINT
} from "@helium/spl-utils";


/**
 * DEPRECATED ENDPOINT
 * Will be removed in future version
 */
server.post<{
  Body: { wallet: PublicKey };
}>("/hnt-to-fees", async (request, reply) => {
  const wallet = new PublicKey(request.body.wallet);

  return Buffer.from(
    (await fundFeesFromHnt(wallet)).serialize({ requireAllSignatures: false })
  ).toJSON().data;
});

server.post<{
  Body: { wallet: PublicKey, fromToken: PublicKey };
}>("/token-to-rent-transaction", async (request, reply) => {
  const wallet = new PublicKey(request.body.wallet);
  const fromToken = new PublicKey(request.body.fromToken);

  if (fromToken.equals(HNT_MINT)) {
    return Buffer.from(
      (await fundFeesFromHnt(wallet)).serialize({ requireAllSignatures: false })
    ).toJSON().data;
  } else if (IOT_MINT.equals(fromToken) || MOBILE_MINT.equals(fromToken)) {
    return Buffer.from(
      (await fundFeesFromTokens(wallet, fromToken)).serialize({ requireAllSignatures: false })
    ).toJSON().data;
  }
  reply.status(400).send("Unsupported token");
  
});


server.get<{
  Body: { wallet: PublicKey, fromToken?: PublicKey };
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
