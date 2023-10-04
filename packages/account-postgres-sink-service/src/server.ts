import Fastify, { FastifyInstance } from "fastify";
import fastifyCron from "fastify-cron";
import cors from "@fastify/cors";
import fs from "fs";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { PublicKey } from "@solana/web3.js";
import {
  HELIUS_AUTH_SECRET,
  PROGRAM_ACCOUNT_CONFIGS,
  RUN_JOBS_AT_STARTUP,
} from "./env";
import database from "./utils/database";
import { defineAllIdlModels } from "./utils/defineIdlModels";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";
import { integrityCheckProgramAccounts } from "./utils/integrityCheckProgramAccounts";
import { handleAccountWebhook } from "./utils/handleAccountWebhook";
import { metrics } from "./plugins/metrics";
import { IConfig } from "./types";
import { EventEmitter } from "events";

if (!HELIUS_AUTH_SECRET) {
  throw new Error("Helius auth secret not available");
}

(async () => {
  const configs = (() => {
    const accountConfigs: null | {
      configs: IConfig[];
    } = JSON.parse(fs.readFileSync(PROGRAM_ACCOUNT_CONFIGS, "utf8"));

    return accountConfigs ? accountConfigs.configs : [];
  })();

  const customJobs = configs
    .filter((x) => !!x.crons)
    .flatMap(({ programId, crons = [] }) =>
      crons.map(({ schedule, type }) => ({
        cronTime: schedule,
        runOnInit: false,
        onTick: async (server: any) => {
          try {
            console.log(`Running custom job: ${type}`);
            await server.inject(`/${type}?program=${programId}`);
          } catch (err) {
            console.error(err);
          }
        },
      }))
    );

  const server: FastifyInstance = Fastify({ logger: false });
  await server.register(cors, { origin: "*" });
  await server.register(fastifyCron, { jobs: [...customJobs] });
  await server.register(metrics);

  const eventHandler = new EventEmitter();

  let refreshing = false;
  eventHandler.on("refresh-accounts", async (programId) => {
    if (!refreshing) {
      refreshing = true;
      try {
        if (configs) {
          for (const config of configs) {
            console.log(
              programId
                ? `Refreshing accounts for program: ${programId}`
                : `Refreshing accounts`
            );
            if ((programId && programId == config.programId) || !programId) {
              try {
                await upsertProgramAccounts({
                  programId: new PublicKey(config.programId),
                  accounts: config.accounts,
                });
              } catch (err) {
                throw err;
              }
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  });

  server.get("/refresh-accounts", async (req, res) => {
    const programId = (req.query as any).program;
    eventHandler.emit("refresh-accounts", programId);
    if (refreshing) {
      res
        .code(StatusCodes.TOO_MANY_REQUESTS)
        .send(ReasonPhrases.TOO_MANY_REQUESTS);
    } else {
      res.code(StatusCodes.OK).send(ReasonPhrases.OK);
    }
  });

  server.get("/integrity-check", async (req, res) => {
    const programId = (req.query as any).program;

    try {
      if (!programId) throw new Error("program not provided");
      console.log(`Integrity checking program: ${programId}`);

      if (configs) {
        const config = configs.find((c) => c.programId === programId);
        if (!config)
          throw new Error(`no config for program: ${programId} found`);

        try {
          await integrityCheckProgramAccounts({
            fastify: server,
            programId: new PublicKey(config.programId),
            accounts: config.accounts,
          });
        } catch (err) {
          throw err;
        }
      }
      res.code(StatusCodes.OK).send(ReasonPhrases.OK);
    } catch (err) {
      res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
      console.error(err);
    }
  });

  server.post("/account-webhook", async (req, res) => {
    if (req.headers.authorization != HELIUS_AUTH_SECRET) {
      res.code(StatusCodes.FORBIDDEN).send({
        message: "Invalid authorization",
      });
      return;
    }

    try {
      const accounts = req.body as any[];

      if (configs) {
        for (const account of accounts) {
          const parsed = account["account"]["parsed"];
          const config = configs.find((x) => x.programId == parsed["owner"]);

          if (!config) {
            // exit early if account doesn't need to be saved
            res.code(StatusCodes.OK).send(ReasonPhrases.OK);
            return;
          }

          try {
            await handleAccountWebhook({
              fastify: server,
              programId: new PublicKey(config.programId),
              accounts: config.accounts,
              account: parsed,
            });
          } catch (err) {
            throw err;
          }
        }
      }
      res.code(StatusCodes.OK).send(ReasonPhrases.OK);
    } catch (err) {
      res.code(StatusCodes.INTERNAL_SERVER_ERROR).send(err);
      console.error(err);
    }
  });

  try {
    // models are defined on boot, and updated in refresh-accounts
    await database.sync();
    await defineAllIdlModels({ configs, sequelize: database });
    await server.listen({ port: 3000, host: "0.0.0.0" });
    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
    // By default, jobs are not running at startup
    if (RUN_JOBS_AT_STARTUP) {
      server.cron.startAllJobs();
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
