import cors from "@fastify/cors";
import { PublicKey } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { settleEstimates } from "./estimates";
import * as jup from "./jupiter";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";

const server: FastifyInstance = Fastify({ logger: true });
server.register(cors, { origin: "*" });

server.get("/health", async (req, res) => {
  res.send({ ok: true });
});

server.post<{
  Body: { wallet: string; mint: string };
}>("/fees", async (req, res) => {
  try {
    const { wallet, mint } = req.body;
    const walletPk = new PublicKey(wallet);
    const mintPk = new PublicKey(mint);

    res.send(
      Buffer.from(
        (await jup.fundFees({ userWallet: walletPk, mint: mintPk })).serialize()
      ).toJSON().data
    );
  } catch (err) {
    res.code(500).send(err);
    console.error(err);
  }
});

server.post<{
  Body: { mint: string };
}>("/estimate", async (req, res) => {
  try {
    const { mint } = req.body;
    const mintPk = new PublicKey(mint);

    res.send({
      estimate: await jup.estimate({ mint: mintPk }),
    });
  } catch (err) {
    res.code(500).send(err);
    console.error(err);
  }
});

server.get<{}>("/estimates", async (req, res) => {
  const mints = [HNT_MINT, MOBILE_MINT, IOT_MINT];
  const results = await Promise.allSettled(
    mints.map((mint) => jup.estimate({ mint }))
  );
  const { estimates, failures, allFailed } = settleEstimates(
    mints.map((mint) => mint.toBase58()),
    results
  );
  failures.forEach(({ mint, reason }) =>
    console.error(`Estimate failed for ${mint}`, reason)
  );
  if (allFailed) {
    res.code(500).send(failures[0].reason);
    return;
  }
  res.send(estimates);
});

const start = async () => {
  try {
    await server.listen({
      port: Number(process.env.PORT) || 8081,
      host: "0.0.0.0",
    });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
