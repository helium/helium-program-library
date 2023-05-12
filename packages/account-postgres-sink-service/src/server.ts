import Fastify, { FastifyInstance } from "fastify";
import fastifyCron from "fastify-cron";
import cors from "@fastify/cors";
import fs from "fs";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { PublicKey } from "@solana/web3.js";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";
import { GLOBAL_CRON_CONFIG, PROGRAM_ACCOUNT_CONFIGS } from "./env";
import { handleAccountWebhook } from "./utils/handleAccountWebhook";
import database from "./utils/database";
import { defineAllIdlModels } from "./utils/defineIdlModels";

const HELIUS_AUTH_SECRET = process.env.HELIUS_AUTH_SECRET;
if (!HELIUS_AUTH_SECRET) {
  throw new Error("Helius auth secret not available");
}

const server: FastifyInstance = Fastify({
  logger: true,
});

server.register(cors, {
  origin: "*",
});

export function parseConfig() {
  const accountConfigs: null | {
    configs: {
      programId: string;
      accounts: { type: string; table: string; schema: string }[];
      cron?: string;
    }[];
  } = JSON.parse(fs.readFileSync(PROGRAM_ACCOUNT_CONFIGS, "utf8"));
  return accountConfigs;
}

server.get("/refresh-accounts", async (req, res) => {
  const programId = (req.query as any).program;
  try {
    const configs = parseConfig()!;
    if (!programId) {
      await defineAllIdlModels({
        configs: configs["configs"],
        sequelize: database,
      });
    }
    if (configs) {
      for (const config of configs.configs) {
        if ((programId && programId == config.programId) || !programId) {
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
    }
    res.code(StatusCodes.OK).send(ReasonPhrases.OK);
  } catch (err) {
    res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
    console.error(err);
  }
  res.code(StatusCodes.OK).send(ReasonPhrases.OK);
});

server.post("/account-webhook", async (req, res) => {
  if (req.headers.authorization != HELIUS_AUTH_SECRET) {
    res.status(403).send({
      message: "Invalid authorization",
    });
    return;
  }

  try {
    const accountConfigs = parseConfig();
    const accounts = req.body as any[];

    if (accountConfigs) {
      for (const account of accounts) {
        const parsed = account["account"]["JsonParsed"];
        const config = accountConfigs.configs.find(
          (x) => x.programId == parsed["owner"]
        );

        if (!config) {
          // exit early if account doesn't need to be saved
          res.code(StatusCodes.OK).send(ReasonPhrases.OK);
          return;
        }

        try {
          await handleAccountWebhook({
            programId: new PublicKey(config.programId),
            configAccounts: config.accounts,
            account: parsed,
          });
        } catch (err) {
          console.error(err);
        }
      }
    }
    res.code(StatusCodes.OK).send(ReasonPhrases.OK);
  } catch (err) {
    res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
    console.error(err);
  }
});

const configs = parseConfig()!;
const customJobs = configs["configs"]
  .filter((x) => !!x.cron)
  .map((x) => {
    return {
      cronTime: x.cron!,
      runOnInit: false,
      onTick: async (server: any) => {
        try {
          await server.inject(`/refresh-accounts?program=${x.programId}`);
        } catch (err) {
          console.error(err);
        }
      },
    };
  });

if (GLOBAL_CRON_CONFIG) {
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
      ...customJobs,
    ],
  });
}

const start = async () => {
  try {
    await database.sync();
    await server.listen({ port: 3000, host: "0.0.0.0" });
    // models are defined on boot, and updated in refresh-accounts
    await defineAllIdlModels({
      configs: configs["configs"],
      sequelize: database,
    });
    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
    // By default, jobs are not running at startup
    if (process.env.RUN_JOBS_AT_STARTUP === "true") {
      server.cron.startAllJobs();
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
