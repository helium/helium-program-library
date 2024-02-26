import { createGrpcTransport } from "@connectrpc/connect-node";
import cors from "@fastify/cors";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import { Connection, PublicKey, TransactionResponse } from "@solana/web3.js";
import {
  applyParams,
  authIssue,
  createAuthInterceptor,
  createRegistry,
  createRequest,
  fetchSubstream,
  isEmptyMessage,
  streamBlocks,
  unpackMapOutput,
} from "@substreams/core";
import { EventEmitter } from "events";
import Fastify, { FastifyInstance } from "fastify";
import fastifyCron from "fastify-cron";
import fs from "fs";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import {
  FETCH_DELAY_SECONDS,
  HELIUS_AUTH_SECRET,
  PROGRAM_ACCOUNT_CONFIGS,
  RUN_JOBS_AT_STARTUP,
  SOLANA_URL,
  USE_SUBSTREAMS,
} from "./env";
import { initPlugins } from "./plugins";
import { metrics } from "./plugins/metrics";
import { IConfig, IInitedPlugin } from "./types";
import { createPgIndexes } from "./utils/createPgIndexes";
import database, { Cursor } from "./utils/database";
import { defineAllIdlModels } from "./utils/defineIdlModels";
import { handleAccountWebhook } from "./utils/handleAccountWebhook";
import { integrityCheckProgramAccounts } from "./utils/integrityCheckProgramAccounts";
import { provider } from "./utils/solana";
import { truthy, upsertProgramAccounts } from "./utils/upsertProgramAccounts";
const { BloomFilter } = require("bloom-filters");

if (!HELIUS_AUTH_SECRET) {
  throw new Error("Helius auth secret not available");
}

(async () => {
  const { configs, indexConfigs } = (() => {
    const dbConfigs: null | {
      configs: IConfig[];
      indexConfigs?: string[];
    } = JSON.parse(fs.readFileSync(PROGRAM_ACCOUNT_CONFIGS, "utf8"));

    return {
      configs: dbConfigs && dbConfigs.configs ? dbConfigs.configs : [],
      indexConfigs:
        dbConfigs && dbConfigs.indexConfigs ? dbConfigs.indexConfigs : [],
    };
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

  let refreshing: Promise<void> | undefined = undefined;
  eventHandler.on("refresh-accounts", (programId) => {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          if (configs) {
            for (const config of configs) {
              if ((programId && programId == config.programId) || !programId) {
                console.log(
                  programId
                    ? `Refreshing accounts for program: ${programId}`
                    : `Refreshing accounts`
                );
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
        } finally {
          refreshing = undefined;
        }
      })();
    }
  });

  server.get("/refresh-accounts", async (req, res) => {
    const programId = (req.query as any).program;
    let prevRefreshing = refreshing;
    eventHandler.emit("refresh-accounts", programId);
    if (prevRefreshing) {
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

  const pluginsByAccountTypeByProgram = (
    await Promise.all(
      configs.map(async (config) => {
        return {
          programId: config.programId,
          pluginsByAccountType: (
            await Promise.all(
              config.accounts.map(async (acc) => {
                const plugins = await initPlugins(acc.plugins);
                return { type: acc.type, plugins };
              })
            )
          ).reduce((acc, { type, plugins }) => {
            acc[type] = plugins.filter(truthy);
            return acc;
          }, {} as Record<string, IInitedPlugin[]>),
        };
      })
    )
  ).reduce((acc, { programId, pluginsByAccountType }) => {
    acc[programId] = pluginsByAccountType;
    return acc;
  }, {} as Record<string, Record<string, IInitedPlugin[]>>);

  // Assume 10 million accounts we might not want to watch (token accounts, etc)
  const nonWatchedAccountsFilter = BloomFilter.create(10000000, 0.05);
  const cache = new AccountFetchCache({
    connection: new Connection(SOLANA_URL),
    commitment: "confirmed",
    extendConnection: false,
    enableLogging: true,
    // One fetch every x second limit. When using substreams, we already batch accounts by block
    // so adding a fetch delay will just cause us to fall behind
    delay: USE_SUBSTREAMS ? 50 : FETCH_DELAY_SECONDS * 1000,
  });
  async function insertTransactionAccounts(writableAccountKeys: PublicKey[]) {
    const accounts = await Promise.all(
      writableAccountKeys
        .filter((wa) => !nonWatchedAccountsFilter.has(wa.toBase58()))
        .map((key) => cache.search(key))
    );

    if (configs) {
      let index = 0;
      for (const account of accounts) {
        const pubkey = writableAccountKeys[index];
        index++;

        // Account not found, delete it from any and all tables
        if (!account) {
          const tables = configs.flatMap((config) =>
            config.accounts.map((acc) => acc.table)
          );
          const transaction = await database.transaction();
          for (const table of tables) {
            await database.query(
              `
                  DELETE FROM ${table} WHERE address = ${database.escape(
                pubkey.toBase58()
              )}
                `,
              {
                transaction,
              }
            );
          }
          await transaction.commit();
          continue;
        }

        // If the owner isn't of a program we're watching, break
        const owner = account.account.owner.toBase58();
        const config = configs.find((x) => x.programId == owner);
        if (!config) {
          if (owner) nonWatchedAccountsFilter.add(account.pubkey.toBase58());
          continue;
        }

        try {
          await handleAccountWebhook({
            fastify: server,
            programId: new PublicKey(config.programId),
            accounts: config.accounts,
            account: {
              pubkey: account.pubkey.toBase58(),
              data: [account.account.data, undefined],
            },
            pluginsByAccountType: pluginsByAccountTypeByProgram[owner] || {},
          });
        } catch (err) {
          throw err;
        }
      }
    }
  }
  server.post<{ Body: any[] }>("/transaction-webhook", async (req, res) => {
    if (req.headers.authorization != HELIUS_AUTH_SECRET) {
      res.code(StatusCodes.FORBIDDEN).send({
        message: "Invalid authorization",
      });
      return;
    }
    if (refreshing) {
      res.code(StatusCodes.SERVICE_UNAVAILABLE).send({
        message: "Refresh is happening, cannot create transactions",
      });
      return;
    }

    try {
      const transactions = req.body as TransactionResponse[];
      const writableAccountKeys = transactions
        .flatMap((tx) =>
          tx.transaction.message.accountKeys
            .slice(
              0,
              tx.transaction.message.accountKeys.length -
                tx.transaction.message.header.numReadonlyUnsignedAccounts
            )
            .filter(
              (_, index) =>
                index <
                  tx.transaction.message.header.numRequiredSignatures -
                    tx.transaction.message.header.numReadonlySignedAccounts ||
                index >= tx.transaction.message.header.numRequiredSignatures
            )
        )
        .map((k) => new PublicKey(k));
      await insertTransactionAccounts(writableAccountKeys);
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
    if (refreshing) {
      res.code(StatusCodes.SERVICE_UNAVAILABLE).send({
        message: "Refresh is happening, cannot create transactions",
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
              pluginsByAccountType:
                pluginsByAccountTypeByProgram[parsed["owner"]] || {},
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
    await createPgIndexes({ indexConfigs, sequelize: database });
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

  if (USE_SUBSTREAMS) {
    await Cursor.sync();
    const lastCursor = await Cursor.findOne({
      order: [["createdAt", "DESC"]],
    });
    const SUBSTREAM =
      "https://github.com/helium/substreams-explorers/releases/download/v0.2.0/solana-explorer-v0.2.0.spkg";
    const MODULE = "map_filter_instructions";
    const substream = await fetchSubstream(SUBSTREAM);
    const registry = createRegistry(substream);
    const { token } = await authIssue(
      "server_e80b2b1b926856ef43c7f50310b85e6f"
    );
    const transport = createGrpcTransport({
      baseUrl: "https://mainnet.sol.streamingfast.io",
      httpVersion: "2",

      interceptors: [createAuthInterceptor(token)],
      useBinaryFormat: true,
      jsonOptions: {
        typeRegistry: registry,
      },
    });
    applyParams(
      [`${MODULE}=accounts[0]=1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w`],
      substream.modules!.modules
    );
    const currentBlock = await provider.connection.getBlockHeight("finalized");
    const request = createRequest({
      substreamPackage: substream,
      outputModule: "map_filter_instructions",
      startBlockNum: currentBlock,
      startCursor: lastCursor ? lastCursor.cursor : undefined,
    });
    console.log(
      `streaming from ${
        lastCursor ? `cursor ${lastCursor.cursor}` : `block ${currentBlock}`
      }`
    );
    for await (const response of streamBlocks(transport, request)) {
      const output = unpackMapOutput(response, registry);
      let cursor;
      if (response.message.case === "blockScopedData") {
        cursor = response.message.value.cursor;
      }
      if (output !== undefined && !isEmptyMessage(output)) {
        await Promise.all(
          (output as any).instructions.map((ix: any) =>
            insertTransactionAccounts(
              ix.accounts.map((a: any) => new PublicKey(a))
            )
          )
        );
        await Cursor.create({
          cursor,
        });
        await lastCursor?.destroy();
      }
    }
  }
})();
