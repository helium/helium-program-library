import cors from "@fastify/cors";
import { PublicKey } from "@solana/web3.js";
import Fastify, { FastifyInstance, FastifyReply } from "fastify";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { refuseUnsupportedMint } from "./build";
import { failure, RequestError } from "./errors";
import { settleEstimates } from "./estimates";

/** Logs the failure and answers with it. Both texts are redacted. */
const sendFailure = (res: FastifyReply, err: unknown): void => {
  const { status, body, log } = failure(err);
  console.error(log);
  res.code(status).send(body);
};

/** Reads the body field `field` as a public key, or refuses the request. */
const readPublicKey = (body: unknown, field: string): PublicKey => {
  const value =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)[field]
      : undefined;
  if (typeof value !== "string") {
    throw new RequestError(`Missing ${field}`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new RequestError(`Invalid ${field}: ${value}`);
  }
};

/** Reads the body's `mint` as a mint the service swaps, or refuses the request. */
const readMint = (body: unknown): PublicKey => {
  const mint = readPublicKey(body, "mint");
  refuseUnsupportedMint(mint.toBase58());
  return mint;
};

/** The HTTP server: `/health`, `/estimate`, `/estimates` and `/fees`. */
export const buildServer = (service: {
  estimate: (args: { mint: PublicKey }) => Promise<string>;
  fundFees: (args: {
    userWallet: PublicKey;
    mint: PublicKey;
  }) => Promise<Uint8Array>;
}): FastifyInstance => {
  const server: FastifyInstance = Fastify({ logger: true });
  server.register(cors, { origin: "*" });

  server.get("/health", async (req, res) => {
    res.send({ ok: true });
  });

  server.post("/fees", async (req, res) => {
    try {
      const userWallet = readPublicKey(req.body, "wallet");
      const mint = readMint(req.body);

      res.send(
        Buffer.from(await service.fundFees({ userWallet, mint })).toJSON().data
      );
    } catch (err) {
      sendFailure(res, err);
    }
  });

  server.post("/estimate", async (req, res) => {
    try {
      const mint = readMint(req.body);

      res.send({
        estimate: await service.estimate({ mint }),
      });
    } catch (err) {
      sendFailure(res, err);
    }
  });

  server.get<{}>("/estimates", async (req, res) => {
    const mints = [HNT_MINT, MOBILE_MINT, IOT_MINT];
    const results = await Promise.allSettled(
      mints.map((mint) => service.estimate({ mint }))
    );
    const { estimates, failures, allFailed } = settleEstimates(
      mints.map((mint) => mint.toBase58()),
      results
    );
    failures.forEach(({ mint, reason }) =>
      console.error(`Estimate failed for ${mint}`, failure(reason).log)
    );
    if (allFailed) {
      const { status, body } = failure(failures[0].reason);
      res.code(status).send(body);
      return;
    }
    res.send(estimates);
  });

  return server;
};
