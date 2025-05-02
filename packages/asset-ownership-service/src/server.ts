import cors from "@fastify/cors";
import { AccountInfo, PublicKey, TransactionResponse } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { PG_POOL_SIZE } from "./env";
// import { ensureEnv } from "./utils/ensureEnv";
import { provider } from "./solana";
// import { setupSubstream } from "./services/substream";
import database from "./database";

if (PG_POOL_SIZE < 5) {
  throw new Error("PG_POOL_SIZE must be minimum of 5");
}

(async () => {
  const server: FastifyInstance = Fastify({ logger: false });
  await server.register(cors, { origin: "*" });

  try {
    await database.sync();
    await server.listen({
      port: Number(process.env.PORT || "3000"),
      host: "0.0.0.0",
    });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
    // await setupSubstream(server, configs).catch((err: any) => {
    //   console.error("Fatal error in Substream connection:", err);
    //   process.exit(1);
    // });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
