import cors from "@fastify/cors";
import { AccountInfo, PublicKey, TransactionResponse } from "@solana/web3.js";
import { BloomFilter } from "bloom-filters";
import { EventEmitter } from "events";
import Fastify, { FastifyInstance } from "fastify";
import fastifyCron, { Params as CronConfig } from "fastify-cron";
import fs from "fs";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { EachMessagePayload, Kafka, KafkaConfig } from "kafkajs";
import {
  HELIUS_AUTH_SECRET,
  KAFKA_BROKERS,
  KAFKA_GROUP_ID,
  KAFKA_PASSWORD,
  KAFKA_TOPIC,
  KAFKA_USER,
  PG_POOL_SIZE,
  PROGRAM_ACCOUNT_CONFIGS,
  REFRESH_PASSWORD,
  USE_HELIUS_WEBHOOK,
  USE_KAFKA,
  USE_SUBSTREAM,
  USE_YELLOWSTONE,
} from "./env";
import { getPluginsByAccountTypeByProgram } from "./plugins";
import { metrics } from "./plugins/metrics";
import { setupYellowstone } from "./services/yellowstone";
import { IConfig } from "./types";
import { createPgIndexes } from "./utils/createPgIndexes";
import { defineAllIdlModels } from "./utils/defineIdlModels";
import { getMultipleAccounts } from "./utils/getMultipleAccounts";
import { getWritableAccountKeys } from "./utils/getWritableAccountKeys";
import { handleAccountWebhook } from "./utils/handleAccountWebhook";
import { integrityCheckProgramAccounts } from "./utils/integrityCheckProgramAccounts";
import { provider } from "./utils/solana";
import { upsertProgramAccounts } from "./utils/upsertProgramAccounts";
import { setupSubstream } from "./services/substream";
import database from "./utils/database";

if (PG_POOL_SIZE < 5) {
  throw new Error("PG_POOL_SIZE must be minimum of 5");
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
      crons.map(
        ({ schedule, type }): CronConfig => ({
          cronTime: schedule,
          onTick: async (server: any) => {
            try {
              console.log(`Running custom job: ${type}`);

              const queryParams = new URLSearchParams({
                program: programId,
              });

              if (type === "refresh-accounts") {
                queryParams.append("password", REFRESH_PASSWORD);
              }

              await server.inject(`/${type}?${queryParams.toString()}`);
            } catch (err) {
              console.error(err);
            }
          },
        })
      )
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
                  `Refreshing accounts for program: ${config.programId}`
                );

                try {
                  await upsertProgramAccounts({
                    programId: new PublicKey(config.programId),
                    accounts: config.accounts,
                  });

                  console.log(
                    `Accounts refreshed for program: ${config.programId}`
                  );
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

  try {
    // models are defined on boot, and updated in refresh-accounts
    await database.sync();
    await defineAllIdlModels({ configs, sequelize: database });
    await createPgIndexes({ indexConfigs, sequelize: database });
    const pluginsByAccountTypeByProgram =
      await getPluginsByAccountTypeByProgram(configs);

    server.get("/refresh-accounts", async (req, res) => {
      const { program: programId, password } = req.query as any;

      if (!programId) {
        res.code(StatusCodes.BAD_REQUEST).send({
          message: "Program parameter is required",
        });
        return;
      }

      if (password !== REFRESH_PASSWORD) {
        res.code(StatusCodes.FORBIDDEN).send({
          message: "Invalid password",
        });
        return;
      }
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

    // Assume 10 million accounts we might not want to watch (token accounts, etc)
    const nonWatchedAccountsFilter = BloomFilter.create(10000000, 0.05);
    async function insertTransactionAccounts(
      accounts: { pubkey: PublicKey; account: AccountInfo<Buffer> | null }[]
    ) {
      if (configs) {
        let index = 0;
        for (const { account, pubkey } of accounts) {
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
          const owner = account.owner.toBase58();
          const config = configs.find((x) => x.programId == owner);
          if (!config) {
            if (owner) nonWatchedAccountsFilter.add(pubkey.toBase58());
            continue;
          }

          try {
            await handleAccountWebhook({
              fastify: server,
              programId: new PublicKey(config.programId),
              accounts: config.accounts,
              account: {
                pubkey: pubkey.toBase58(),
                data: [account.data, undefined],
              },
              pluginsByAccountType: pluginsByAccountTypeByProgram[owner] || {},
            });
          } catch (err) {
            throw err;
          }
        }
      }
    }

    if (USE_HELIUS_WEBHOOK) {
      if (!HELIUS_AUTH_SECRET) {
        throw new Error("HELIUS_AUTH_SECRET undefined");
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
          const writableAccountKeys = transactions.flatMap((tx) =>
            getWritableAccountKeys(
              tx.transaction.message.accountKeys,
              tx.transaction.message.header
            )
          );

          await insertTransactionAccounts(
            await getMultipleAccounts({
              connection: provider.connection,
              keys: writableAccountKeys,
            })
          );
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
              const config = configs.find(
                (x) => x.programId == parsed["owner"]
              );

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
    }

    await server.listen({
      port: Number(process.env.PORT || "3000"),
      host: "0.0.0.0",
    });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);

    if (customJobs.length > 0) {
      server.cron.startAllJobs();
    }

    if (USE_SUBSTREAM) {
      await setupSubstream(server, configs).catch((err: any) => {
        console.error("Fatal error in Substream connection:", err);
        process.exit(1);
      });
    }

    if (USE_YELLOWSTONE) {
      await setupYellowstone(server, configs).catch((err: any) => {
        console.error("Fatal error in Yellowstone connection:", err);
        process.exit(1);
      });
    }

    if (USE_KAFKA) {
      if (!KAFKA_USER) throw new Error("KAFKA_USER undefined");
      if (!KAFKA_TOPIC) throw new Error("KAFKA_TOPIC undefined");
      if (!KAFKA_BROKERS) throw new Error("KAFKA_BROKERS undefined");
      if (!KAFKA_PASSWORD) throw new Error("KAFKA_PASSWORD undefined");
      if (!KAFKA_GROUP_ID) throw new Error("KAFKA_GROUP_ID undefined");

      const kafkaConfig: KafkaConfig = {
        ssl: true,
        clientId: "helium-reader",
        brokers: KAFKA_BROKERS,
        sasl: {
          mechanism: "scram-sha-512",
          username: KAFKA_USER,
          password: KAFKA_PASSWORD,
        },
      };

      const kafka = new Kafka(kafkaConfig);
      const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

      await consumer.connect();
      await consumer.subscribe({
        topic: KAFKA_TOPIC,
        fromBeginning: false,
      });

      await consumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          if (message.value) {
            const {
              data,
              program: programId,
              pubkey,
              isDelete,
            } = JSON.parse(message.value.toString());

            const config = configs.find((x) => x.programId == programId);

            if (config) {
              await handleAccountWebhook({
                fastify: server,
                programId: new PublicKey(config.programId),
                accounts: config.accounts,
                isDelete,
                account: {
                  pubkey: pubkey,
                  data: [data, "base64"],
                },
                pluginsByAccountType:
                  pluginsByAccountTypeByProgram[programId] || {},
              });
            }
          }
        },
      });
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
