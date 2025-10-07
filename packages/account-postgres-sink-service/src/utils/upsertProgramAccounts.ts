import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import retry from "async-retry";
import { Op, Sequelize, Transaction } from "sequelize";
import { SOLANA_URL } from "../env";
import { initPlugins } from "../plugins";
import { IAccountConfig } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import { database, limit } from "./database";
import { defineIdlModels } from "./defineIdlModels";
import { sanitizeAccount } from "./sanitizeAccount";
import { truthy } from "./truthy";
import { lowerFirstChar } from "@helium/spl-utils";
import { decompress } from "@mongodb-js/zstd";
import axios from "axios";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamArray } from "stream-json/streamers/StreamArray";
import deepEqual from "deep-equal";
import _omit from "lodash/omit";
import { OMIT_KEYS } from "../constants";

interface UpsertProgramAccountsArgs {
  programId: PublicKey;
  accounts: IAccountConfig[];
  sequelize?: Sequelize;
}

export const upsertProgramAccounts = async ({
  programId,
  accounts,
  sequelize = database,
}: UpsertProgramAccountsArgs) => {
  anchor.setProvider(
    anchor.AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL || SOLANA_URL)
  );
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  const idl = await cachedIdlFetch.fetchIdl({
    skipCache: true,
    programId: programId.toBase58(),
    provider,
  });

  if (!idl) {
    throw new Error(`unable to fetch idl for ${programId}`);
  }

  if (
    !accounts.every(({ type }) =>
      idl.accounts!.some(({ name }) => name === type)
    )
  ) {
    throw new Error("idl does not have every account type");
  }

  const program = new anchor.Program(idl, provider);

  try {
    await sequelize.authenticate();
    await defineIdlModels({
      idl,
      accounts,
      sequelize,
    });
  } catch (e) {
    console.log(e);
    throw e;
  }

  const streamAccounts = async (
    stream: NodeJS.ReadableStream,
    onAccount: (account: any) => Promise<void>
  ) => {
    return new Promise<void>((resolve, reject) => {
      let hasReceivedData = false;
      const pipeline = stream
        .pipe(parser())
        .pipe(pick({ filter: "result" }))
        .pipe(streamArray());

      stream.on("data", (chunk) => {
        if (!hasReceivedData) {
          hasReceivedData = true;
        }
      });

      pipeline.on("data", async ({ value }) => {
        pipeline.pause();
        try {
          await onAccount(value);
          pipeline.resume();
        } catch (err) {
          reject(err);
        }
      });

      pipeline.on("end", () => {
        if (!hasReceivedData) {
          console.log("Stream ended without receiving any data");
        }
        resolve();
      });

      pipeline.on("error", (err: any) => {
        console.error("Stream processing error:", err);
        reject(err);
      });
    });
  };

  const processProgramAccounts = async (
    connection: anchor.web3.Connection,
    programId: anchor.web3.PublicKey,
    accountType: string,
    filters: anchor.web3.GetProgramAccountsFilter[],
    batchSize: number,
    processChunk: (
      chunk: anchor.web3.GetProgramAccountsResponse,
      transaction: Transaction
    ) => Promise<void>
  ) => {
    const startTime = Date.now();
    let processedCount = 0;
    console.log(`Processing ${accountType} accounts`);

    await retry(
      async () => {
        try {
          console.log(
            `Making RPC call for ${accountType} with filters:`,
            JSON.stringify(filters, null, 2)
          );

          const result = await axios.post(
            SOLANA_URL,
            {
              jsonrpc: "2.0",
              id: `refresh-accounts-${programId.toBase58()}-${accountType}`,
              method: "getProgramAccounts",
              params: [
                programId.toBase58(),
                {
                  commitment: "confirmed",
                  encoding: "base64+zstd",
                  filters,
                },
              ],
            },
            {
              responseType: "stream",
              timeout: 60000,
            }
          );
          console.log(
            `RPC call successful for ${accountType}, processing stream...`
          );

          let batch: {
            account: anchor.web3.AccountInfo<Buffer>;
            pubkey: anchor.web3.PublicKey;
          }[] = [];
          const concurrentBatchLimit = 5;
          let activeBatches: Promise<void>[] = [];

          let accountsReceived = 0;
          await streamAccounts(result.data, async (account) => {
            accountsReceived++;
            if (accountsReceived === 1) {
              console.log(`First account received for ${accountType}`);
            }
            batch.push(account);
            if (batch.length >= batchSize) {
              const currentBatch = batch;
              batch = [];
              if (activeBatches.length >= concurrentBatchLimit) {
                await Promise.race(activeBatches);
              }

              const batchPromise = limit(async () => {
                const t = await sequelize.transaction({
                  isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
                });
                try {
                  await processChunk(currentBatch, t);
                  await t.commit();
                  processedCount += currentBatch.length;
                  console.log(
                    `Processing ${currentBatch.length} ${accountType} accounts`
                  );
                } catch (err) {
                  await t.rollback();
                  throw err;
                }

                if (global.gc) {
                  global.gc();
                }
              });

              activeBatches.push(batchPromise);

              batchPromise.finally(() => {
                const index = activeBatches.indexOf(batchPromise);
                if (index > -1) {
                  activeBatches.splice(index, 1);
                }
              });
            }
          });

          if (batch.length > 0) {
            const batchPromise = limit(async () => {
              const t = await sequelize.transaction({
                isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
              });
              try {
                await processChunk(batch, t);
                await t.commit();
                processedCount += batch.length;
                console.log(
                  `Processing ${batch.length} ${accountType} accounts`
                );
              } catch (err) {
                await t.rollback();
                throw err;
              }
            });
            activeBatches.push(batchPromise);
          }

          await Promise.all(activeBatches);
          console.log(
            `Stream processing complete for ${accountType}. Accounts received: ${accountsReceived}, Accounts processed: ${processedCount}`
          );
        } catch (err: any) {
          console.error(`RPC call error for ${accountType}:`, err.message);
          throw err;
        }
      },
      {
        retries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 60000,
        onRetry: (err, attempt) => {
          console.warn(
            `Retrying getProgramAccounts for ${accountType}, attempt #${attempt}: Retrying due to ${err.message}`
          );
        },
      }
    );

    const duration = (Date.now() - startTime) / 1000;
    console.log(
      `Finished processing ${processedCount} ${accountType} accounts in ${duration} seconds`
    );

    return processedCount;
  };

  for (const { type, batchSize = 50000, ...rest } of accounts) {
    try {
      const model = sequelize.models[type];
      const plugins = await initPlugins(rest.plugins);

      const hasGeocodingPlugin = rest.plugins?.some(
        (p) => p.type === "ExtractHexLocation"
      );

      const effectiveBatchSize = hasGeocodingPlugin
        ? Math.min(batchSize, 25000)
        : batchSize;

      console.log(
        `Using batch size ${effectiveBatchSize} for ${type} accounts${
          hasGeocodingPlugin ? " (reduced due to geocoding)" : ""
        }`
      );

      const filter = program.coder.accounts.memcmp(
        lowerFirstChar(type),
        undefined
      );
      const coderFilters: GetProgramAccountsFilter[] = [];

      if (filter?.offset != undefined && filter?.bytes != undefined) {
        coderFilters.push({
          memcmp: {
            offset: filter.offset,
            bytes: filter.bytes,
          },
        });
      }

      if (filter?.dataSize != undefined) {
        coderFilters.push({ dataSize: filter.dataSize });
      }

      const now = new Date().toISOString();
      // Add retry wrapper for the entire account processing
      const processedCount = await retry(
        async () => {
          const count = await processProgramAccounts(
            connection,
            programId,
            type,
            coderFilters,
            effectiveBatchSize,
            async (chunk, transaction) => {
              let decodeErrors = 0;

              const accs = (
                await Promise.all(
                  chunk.map(async ({ pubkey, account }) => {
                    try {
                      const data =
                        Array.isArray(account.data) &&
                        account.data[1] === "base64+zstd"
                          ? await decompress(
                              Buffer.from(account.data[0], "base64")
                            )
                          : Array.isArray(account.data) &&
                            account.data[1] === "base64"
                          ? Buffer.from(account.data[0], "base64")
                          : account.data;

                      const decodedAcc = program.coder.accounts.decode(
                        lowerFirstChar(type),
                        data
                      );

                      return {
                        publicKey: pubkey,
                        account: decodedAcc,
                      };
                    } catch (_e) {
                      decodeErrors++;
                      if (decodeErrors <= 3) {
                        // Only log first 3 decode errors to avoid spam
                        console.error(`Decode error ${pubkey}:`, _e);
                      }
                      return null;
                    }
                  })
                )
              ).filter(truthy);

              if (decodeErrors > 0) {
                console.log(
                  `${type} batch: ${accs.length} successful decodes, ${decodeErrors} decode errors out of ${chunk.length} accounts`
                );
              }

              // Skip processing if no accounts were successfully decoded
              if (accs.length === 0) {
                console.warn(
                  `Skipping batch processing for ${type} - no accounts successfully decoded`
                );
                return;
              }

              const updateOnDuplicateFields: string[] = [
                ...Object.keys(accs[0].account),
                ...new Set(
                  plugins
                    .map((plugin) => plugin?.updateOnDuplicateFields || [])
                    .flat()
                ),
              ];

              // Fetch existing records to compare
              const addresses = accs.map(({ publicKey }) => publicKey);
              const existingRecords = await model.findAll({
                where: { address: addresses },
                transaction,
              });

              const existingRecordMap = new Map(
                existingRecords.map((record) => [record.get("address"), record])
              );

              // Get current slot with retry - fetch once for the entire batch
              let lastBlock: number = 0;
              try {
                lastBlock = await retry(() => connection.getSlot("finalized"), {
                  retries: 3,
                  factor: 2,
                  minTimeout: 1000,
                  maxTimeout: 5000,
                });
              } catch (error) {
                console.warn("Failed to fetch block after retries:", error);
              }

              const values = await Promise.all(
                accs.map(async ({ publicKey, account }) => {
                  let sanitizedAccount = sanitizeAccount(account);

                  for (const plugin of plugins) {
                    if (plugin?.processAccount) {
                      sanitizedAccount = await plugin.processAccount(
                        { ...sanitizedAccount, address: publicKey },
                        transaction,
                        lastBlock
                      );
                    }
                  }

                  const newRecord = {
                    address: publicKey,
                    refreshedAt: now,
                    ...sanitizedAccount,
                  };

                  const existingRecord = existingRecordMap.get(publicKey);
                  const existingData = existingRecord?.dataValues;
                  const existingClean = _omit(existingData || {}, OMIT_KEYS);
                  const newClean = _omit(newRecord, OMIT_KEYS);

                  const shouldUpdate =
                    !existingRecord || !deepEqual(newClean, existingClean);

                  if (shouldUpdate) {
                    return {
                      ...newRecord,
                      lastBlock,
                    };
                  } else {
                    return {
                      ...newRecord,
                      lastBlock: existingData?.lastBlock || lastBlock,
                    };
                  }
                })
              );

              await model.bulkCreate(values, {
                transaction,
                updateOnDuplicate: [
                  "address",
                  "refreshedAt",
                  "lastBlock",
                  ...updateOnDuplicateFields,
                ],
              });
            }
          );

          // Throw error if no accounts processed to trigger retry
          if (count === 0 && !rest.ignore_deletes) {
            throw new Error(
              `No accounts processed for type ${type} - retrying`
            );
          }

          return count;
        },
        {
          retries: 3,
          factor: 2,
          minTimeout: 2000,
          maxTimeout: 10000,
          onRetry: (err, attempt) => {
            console.warn(
              `Retrying account processing for ${type}, attempt #${attempt}: ${err.message}`
            );
          },
        }
      );

      // Only delete old records if we actually processed some accounts
      if (!rest.ignore_deletes && processedCount > 0) {
        console.log(`Cleaning up old ${type} records that were not refreshed`);
        const deletedCount = await model.destroy({
          where: {
            refreshedAt: {
              [Op.lt]: now,
            },
          },
        });
        console.log(`Deleted ${deletedCount} old ${type} records`);
      } else if (!rest.ignore_deletes && processedCount === 0) {
        // This would only trigger after all retries are exhausted
        console.error(
          `ERROR: Failed to process any ${type} accounts after retries. This indicates a persistent issue with account fetching.`
        );
      }
    } catch (err) {
      console.error(`Error processing account type ${type}:`, err);
    }
  }
};
