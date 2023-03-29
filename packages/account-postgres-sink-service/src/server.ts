import Fastify, { FastifyInstance } from "fastify";
import fastifyCron from "fastify-cron";
import cors from "@fastify/cors";
import fs from "fs";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { PublicKey } from "@solana/web3.js";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";
import { GLOBAL_CRON_CONFIG, PROGRAM_ACCOUNT_CONFIGS } from "./env";

const server: FastifyInstance = Fastify({
  logger: true,
});

server.register(cors, {
  origin: "*",
});

server.get("/refresh-accounts", async (_reg, res) => {
  try {
    const accountConfigs: null | {
      configs: {
        programId: string;
        accounts: { type: string; table: string; schema: string }[];
      }[];
    } = JSON.parse(fs.readFileSync(PROGRAM_ACCOUNT_CONFIGS, "utf8"));

    if (accountConfigs) {
      for (const config of accountConfigs.configs) {
        try {
          await upsertProgramAccounts({
            programId: new PublicKey(config.programId),
            accounts: config.accounts,
          });
        } catch (err) {
          console.log(err);
        }
      }
    }
    res.code(StatusCodes.OK).send(ReasonPhrases.OK);
  } catch (err) {
    res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
    console.error(err);
  }
});

server.register(fastifyCron, {
  jobs: [
    {
      cronTime: GLOBAL_CRON_CONFIG,
      runOnInit: true,
      onTick: async (server) => {
        try {
          await server.inject("/refresh-accounts");
        } catch (err) {
          console.error(err);
        }
      },
    },
  ],
});

export default server;
