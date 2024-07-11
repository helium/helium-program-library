import { createGrpcTransport } from "@connectrpc/connect-node";
import cors from "@fastify/cors";
import {
  AccountInfo,
  Connection,
  PublicKey,
  TransactionResponse,
} from "@solana/web3.js";
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
import Client, {
  SubscribeRequest,
  SubscribeUpdate,
  SubscribeUpdateAccount,
  SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import { BloomFilter } from "bloom-filters";
import { EventEmitter } from "events";
import Fastify, { FastifyInstance } from "fastify";
import fastifyCron from "fastify-cron";
import fs from "fs";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { EachMessagePayload, Kafka, KafkaConfig } from "kafkajs";
import { Op } from "sequelize";
import {
  HELIUS_AUTH_SECRET,
  PROGRAM_ACCOUNT_CONFIGS,
  REFRESH_PASSWORD,
  RUN_JOBS_AT_STARTUP,
  SUBSTREAM,
  USE_KAFKA,
  USE_SUBSTREAMS,
  USE_YELLOWSTONE,
  YELLOWSTONE_TOKEN,
  YELLOWSTONE_URL,
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
import cachedIdlFetch from "./utils/cachedIdlFetch";
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import { getWritableAccountKeys } from "./utils/getWritableAccountKeys";

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
    const { program: programId, password } = req.query as any;
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
    await server.listen({
      port: Number(process.env.PORT || "3000"),
      host: "0.0.0.0",
    });
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

  if (USE_KAFKA) {
    const kafkaConfig: KafkaConfig = {
      ssl: true,
      clientId: "helium-reader",
      sasl: {
        mechanism: "scram-sha-512",
        username: process.env.KAFKA_USER!,
        // Remove newlines from password
        password: process.env.KAFKA_PASSWORD!.replace(/(\r\n|\n|\r)/gm, ""),
      },
      brokers: process.env.KAFKA_BROKERS!.split(","),
    };
    const kafka = new Kafka(kafkaConfig);
    const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID! });

    await consumer.connect();
    await consumer.subscribe({
      topic: process.env.KAFKA_TOPIC!,
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

  if (USE_SUBSTREAMS) {
    await Cursor.sync();
    const lastCursor = await Cursor.findOne({
      order: [["createdAt", "DESC"]],
    });
    const MODULE = "map_filter_instructions";
    const substream = await fetchSubstream(SUBSTREAM!);
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
    const accounts = configs
      .map((config, idx) => `accounts[${idx}]=${config.programId}`)
      .join("&");
    applyParams([`${MODULE}=${accounts}`], substream.modules!.modules);

    let cursor = lastCursor?.cursor;
    let running = true;
    while (running) {
      try {
        running = false;
        const currentBlock = await provider.connection.getSlot("finalized");
        const request = createRequest({
          substreamPackage: substream,
          outputModule: "map_filter_instructions",
          startBlockNum: cursor ? undefined : currentBlock,
          startCursor: cursor,
          productionMode: true,
        });
        console.log(
          `streaming from ${
            lastCursor ? `cursor ${lastCursor.cursor}` : `block ${currentBlock}`
          }`
        );
        for await (const response of streamBlocks(transport, request)) {
          const output = unpackMapOutput(response, registry);
          if (response.message.case === "blockScopedData") {
            cursor = response.message.value.cursor;
          }
          if (output !== undefined && !isEmptyMessage(output)) {
            // Re attempt insertion if possible.
            await withRetries(10, async () => {
              const slot: bigint = (output as any).slot;
              if (slot % BigInt(100) == BigInt(0)) {
                console.log("Slot", slot);
                const diff = currentBlock - Number(slot);
                if (diff > 0) {
                  console.log(`${(diff * 400) / 1000} Seconds behind`);
                }
              }
              const allWritableAccounts = [
                ...new Set(
                  (output as any).instructions.flatMap((ix: any) =>
                    ix.accounts
                      .filter((acc: any) => acc.isWritable)
                      .map((a: any) => a.pubkey)
                  )
                ),
              ];

              await insertTransactionAccounts(
                await getMultipleAccounts({
                  connection: provider.connection,
                  keys: allWritableAccounts.map(
                    (a) => new PublicKey(a as string)
                  ),
                  minContextSlot: Number(slot),
                })
              );

              await Cursor.upsert({
                cursor,
              });
              await Cursor.destroy({
                where: {
                  cursor: {
                    [Op.ne]: cursor,
                  },
                },
              });
            });
          }
        }
      } catch (e: any) {
        if (e.toString().includes("ConnectError")) {
          running = true;
          console.error(e);
        } else {
          console.error(e);
          process.exit(1);
        }
      }
    }
  }

  try {
    if (USE_YELLOWSTONE) {
      const client = new Client(YELLOWSTONE_URL, YELLOWSTONE_TOKEN, {
        "grpc.max_receive_message_length": 2065853043,
        "grpc.": "true",
      });

      const stream = await client.subscribe();

      console.log("Connected");

      // Create `error` / `end` handler
      const streamClosed = new Promise<void>((resolve, reject) => {
        stream.on("error", (error) => {
          reject(error);
          stream.end();
        });
        stream.on("end", () => {
          resolve();
        });
        stream.on("close", () => {
          resolve();
        });
      });

      // Handle updates
      stream.on("data", async (data: SubscribeUpdate) => {
        // only used for deletes currently
        if (data.transaction) {
          const transaction = (data.transaction as SubscribeUpdateTransaction)
            ?.transaction?.transaction;

          if (transaction?.message && configs) {
            const message = transaction.message;
            const { accountKeys, header, instructions } = message;

            for (const ix of instructions) {
              const pIdIdx = ix.programIdIndex;
              const owner = new PublicKey(accountKeys[pIdIdx]).toBase58();
              const config = configs.find((x) => x.programId === owner);

              if (config) {
                try {
                  await (async () => {
                    const idl = await cachedIdlFetch.fetchIdl({
                      programId: owner,
                      provider,
                    });

                    if (!idl) {
                      throw new Error(`unable to fetch idl for ${owner}`);
                    }

                    if (
                      !config.accounts.every(({ type }) =>
                        idl.accounts!.some(({ name }) => name === type)
                      )
                    ) {
                      throw new Error("idl does not have every account type");
                    }

                    const coder = new BorshInstructionCoder(idl);
                    const parsed = coder.decode(Buffer.from(ix.data), "base58");
                    const writableAccounts = getWritableAccountKeys(
                      accountKeys,
                      header!
                    );

                    console.log({
                      accounts: ix.accounts,
                      accountKeys,
                      writableAccounts,
                    });

                    const ixAccounts = Array.from(ix.accounts)
                      .map((idx) => accountKeys[idx])
                      .filter(truthy)
                      .map((key) => ({
                        pubkey: new PublicKey(key),
                        isSigner: false,
                        isWritable: false,
                      }));

                    if (parsed) {
                      const formatted = coder.format(parsed, ixAccounts);

                      if (formatted) {
                        console.log(formatted.accounts);
                      }
                    }
                  })();
                } catch (err) {
                  console.error(err);
                }
              }
            }
          }
        }

        if (data.account) {
          const account = (data.account as SubscribeUpdateAccount)?.account;
          if (account && configs) {
            const owner = new PublicKey(account.owner).toBase58();
            const config = configs.find((x) => x.programId === owner);

            if (config) {
              try {
                await handleAccountWebhook({
                  fastify: server,
                  programId: new PublicKey(config.programId),
                  accounts: config.accounts,
                  account: {
                    ...account,
                    pubkey: new PublicKey(account.pubkey).toBase58(),
                    data: [account.data],
                  },
                  pluginsByAccountType:
                    pluginsByAccountTypeByProgram[owner] || {},
                });
              } catch (err) {
                console.error(err);
              }
            }
          }
        }
      });

      const request: SubscribeRequest = {
        accounts: {
          client: {
            owner: configs.map((c) => c.programId),
            account: [],
            filters: [],
          },
        },
        slots: {},
        transactions: {
          client: {
            vote: false,
            failed: false,
            accountInclude: configs.map((c) => c.programId),
            accountExclude: [],
            accountRequired: [],
          },
        },
        entry: {},
        blocks: {},
        blocksMeta: {},
        accountsDataSlice: [],
        ping: undefined,
      };

      await new Promise<void>((resolve, reject) => {
        stream.write(request, (err: any) => {
          if (err === null || err === undefined) {
            resolve();
          } else {
            reject(err);
          }
        });
      }).catch((reason) => {
        console.error(reason);
        throw reason;
      });

      await streamClosed;
    }
  } catch (e: any) {
    console.error(e);
    process.exit(1);
  }
})();

async function withRetries<A>(
  tries: number,
  input: () => Promise<A>
): Promise<A> {
  for (let i = 0; i < tries; i++) {
    try {
      return await input();
    } catch (e) {
      console.log(`${new Date().toISOString()}: Retrying ${i}...`, e);
      await sleep(2000);
    }
  }
  throw new Error("Failed after retries");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMultipleAccounts({
  connection,
  keys,
  minContextSlot,
}: {
  connection: Connection;
  keys: PublicKey[];
  minContextSlot?: number;
}): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer> | null }[]> {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: { pubkey: PublicKey; account: AccountInfo<Buffer> | null }[] =
    [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys, {
      minContextSlot,
      commitment: "confirmed",
    });
    results.push(
      ...batchResults.map((account, i) => ({ account, pubkey: batchKeys[i] }))
    );
  }

  return results;
}
