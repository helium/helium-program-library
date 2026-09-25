import * as anchor from "@coral-xyz/anchor";
import retry from "async-retry";
import axios from "axios";
import { Sequelize, Transaction } from "sequelize";
import { SOLANA_URL } from "../env";
import { limit } from "./database";
import { streamAccounts } from "./streamAccounts";

export const processProgramAccounts = async (
  sequelize: Sequelize,
  connection: anchor.web3.Connection,
  programId: anchor.web3.PublicKey,
  accountType: string,
  filters: anchor.web3.GetProgramAccountsFilter[],
  batchSize: number,
  processChunk: (
    chunk: anchor.web3.GetProgramAccountsResponse,
    transaction: Transaction,
    lastBlock: number
  ) => Promise<void>
) => {
  const startTime = Date.now();
  let processedCount = 0;
  console.log(`Processing ${accountType} accounts`);

  await retry(
    async () => {
      // Count per attempt: batches of an abandoned attempt may still commit.
      let attemptCount = 0;
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
                encoding: "base64",
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
                // Get current slot at start of transaction
                let lastBlock: number = 0;
                try {
                  lastBlock = await retry(
                    () => connection.getSlot("finalized"),
                    {
                      retries: 3,
                      factor: 2,
                      minTimeout: 1000,
                      maxTimeout: 5000,
                    }
                  );
                } catch (error) {
                  console.warn("Failed to fetch block after retries:", error);
                }
                await processChunk(currentBatch, t, lastBlock);
                await t.commit();
                attemptCount += currentBatch.length;
                console.log(
                  `Processing ${currentBatch.length} ${accountType} accounts (block: ${lastBlock})`
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

            const removeBatch = () => {
              const index = activeBatches.indexOf(batchPromise);
              if (index > -1) {
                activeBatches.splice(index, 1);
              }
            };
            // A rejected batch stays in activeBatches so Promise.race/all surface it;
            // the no-op handler only keeps this derived promise from rejecting unhandled.
            batchPromise.then(removeBatch, () => {});
          }
        });

        if (batch.length > 0) {
          const batchPromise = limit(async () => {
            const t = await sequelize.transaction({
              isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
            });
            try {
              // Get current slot at start of transaction
              let lastBlock: number = 0;
              try {
                lastBlock = await retry(
                  () => connection.getSlot("finalized"),
                  {
                    retries: 3,
                    factor: 2,
                    minTimeout: 1000,
                    maxTimeout: 5000,
                  }
                );
              } catch (error) {
                console.warn("Failed to fetch block after retries:", error);
              }
              await processChunk(batch, t, lastBlock);
              await t.commit();
              attemptCount += batch.length;
              console.log(
                `Processing ${batch.length} ${accountType} accounts (block: ${lastBlock})`
              );
            } catch (err) {
              await t.rollback();
              throw err;
            }
          });
          activeBatches.push(batchPromise);
        }

        await Promise.all(activeBatches);
        processedCount = attemptCount;
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
      onRetry: (err: any, attempt: any) => {
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
