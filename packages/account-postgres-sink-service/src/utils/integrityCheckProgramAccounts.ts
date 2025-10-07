import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import retry, { Options as RetryOptions } from "async-retry";
import deepEqual from "deep-equal";
import { FastifyInstance } from "fastify";
import _omit from "lodash/omit";
import pLimit from "p-limit";
import { Sequelize, Transaction, Op } from "sequelize";
import { SOLANA_URL, INTEGRITY_CHECK_REFRESH_THRESHOLD_MS } from "../env";
import { initPlugins } from "../plugins";
import { IAccountConfig, IInitedPlugin } from "../types";
import { chunks } from "./chunks";
import database from "./database";
import { getBlockTimeWithRetry } from "./getBlockTimeWithRetry";
import { getTransactionSignaturesUptoBlockTime } from "./getTransactionSignaturesUpToBlock";
import { sanitizeAccount } from "./sanitizeAccount";
import { truthy } from "./truthy";
import { OMIT_KEYS } from "../constants";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { lowerFirstChar } from "@helium/spl-utils";

interface IntegrityCheckProgramAccountsArgs {
  fastify: FastifyInstance;
  programId: PublicKey;
  accounts: IAccountConfig[];
  sequelize?: Sequelize;
}

const retryOptions: RetryOptions = {
  retries: 5,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 60000,
};

export const integrityCheckProgramAccounts = async ({
  fastify,
  programId,
  accounts,
  sequelize = database,
}: IntegrityCheckProgramAccountsArgs) => {
  console.log(`Integrity checking: ${programId}`);
  anchor.setProvider(
    anchor.AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL || SOLANA_URL)
  );

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  const idl = await fetchBackwardsCompatibleIdl(
    new PublicKey(programId),
    provider
  );

  if (!idl) {
    throw new Error(`unable to fetch idl for ${programId}`);
  }

  if (
    !accounts.every(({ type }) =>
      idl.accounts!.some((account: { name: string }) => account.name === type)
    )
  ) {
    throw new Error("idl does not have every account type");
  }

  const performIntegrityCheck = async () => {
    const snapshotTime = new Date();
    const refreshThreshold = new Date(
      snapshotTime.getTime() - INTEGRITY_CHECK_REFRESH_THRESHOLD_MS
    );

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      let limiter: pLimit.Limit;
      const program = new anchor.Program(idl, provider);
      const snapshotSlot = await connection.getSlot("finalized");
      let blockTime24HoursAgo: number | null = null;
      let attemptSlot = snapshotSlot - Math.floor((24 * 60 * 60 * 1000) / 400); // Slot 24hrs ago (assuming a slot duration of 400ms);
      const SLOTS_INCREMENT = 2;

      for (
        let blockTimeAttemps = 0;
        blockTimeAttemps < 10 && !blockTime24HoursAgo;
        blockTimeAttemps++
      ) {
        blockTime24HoursAgo = await getBlockTimeWithRetry({
          slot: attemptSlot,
          provider,
        });

        if (blockTime24HoursAgo) {
          break;
        }

        if (!blockTime24HoursAgo) {
          attemptSlot += SLOTS_INCREMENT; // move forward 2 slots each attempt
          console.log(
            `Failed to get blocktime for slot ${
              attemptSlot - SLOTS_INCREMENT
            }, trying slot ${attemptSlot}`
          );
        }
      }

      if (!blockTime24HoursAgo) {
        throw new Error("Unable to get any blocktime in the last 24 hours");
      }

      const txIdsByAccountId: { [key: string]: string[] } = {};
      const corrections: {
        type: string;
        accountId: string;
        txSignatures: string[];
        currentValues: null | { [key: string]: any };
        newValues: { [key: string]: any };
      }[] = [];

      const txSignatureChunks = chunks(
        await getTransactionSignaturesUptoBlockTime({
          programId,
          blockTime: blockTime24HoursAgo,
          provider,
        }),
        100
      );

      limiter = pLimit(10);
      const parsedTransactions = (
        await Promise.all(
          txSignatureChunks.map((chunk) =>
            limiter(async () => {
              await new Promise((resolve) => setTimeout(resolve, 250));
              return retry(
                () =>
                  connection.getParsedTransactions(chunk, {
                    commitment: "finalized",
                    maxSupportedTransactionVersion: 0,
                  }),
                retryOptions
              );
            })
          )
        )
      ).flat();

      const uniqueWritableAccounts = new Set<string>();
      for (const parsed of parsedTransactions) {
        if (!parsed) continue;
        const signatures = parsed.transaction.signatures;
        parsed.transaction.message.accountKeys.forEach((acc) => {
          if (acc.writable) {
            const pubkey = acc.pubkey.toBase58();
            uniqueWritableAccounts.add(pubkey);
            txIdsByAccountId[pubkey] = [
              ...signatures,
              ...(txIdsByAccountId[pubkey] || []),
            ];
          }
        });
      }

      // Dereference txSignatureChunks after use
      txSignatureChunks.length = 0;
      // Dereference parsedTransactions after use
      parsedTransactions.length = 0;

      const pluginsByAccountType = (
        await Promise.all(
          accounts.map(async (acc) => {
            const plugins = await initPlugins(acc.plugins);
            return { type: acc.type, plugins };
          })
        )
      ).reduce((acc, { type, plugins }) => {
        acc[type] = plugins.filter(truthy);
        return acc;
      }, {} as Record<string, IInitedPlugin[]>);

      const discriminatorsByType = new Map(
        accounts.map(({ type }) => [
          type,
          (
            program.coder.accounts as anchor.BorshAccountsCoder
          ).accountDiscriminator(lowerFirstChar(type)),
        ])
      );

      limiter = pLimit(100);
      const uniqueWritableAccountsArray = [...uniqueWritableAccounts.values()];

      // Filter out recently refreshed accounts from the database first
      const accountsToCheck = new Set<string>();
      for (const accName of accounts.map((a) => a.type)) {
        const model = sequelize.models[accName];
        if (!model) continue;

        const staleAccounts = await model.findAll({
          attributes: ["address"],
          where: {
            address: uniqueWritableAccountsArray,
            [Op.or]: [
              { refreshedAt: null },
              {
                refreshedAt: { [Op.lt]: refreshThreshold },
              },
            ],
          },
          raw: true,
          transaction: t,
        });
        staleAccounts.forEach((acc: any) => accountsToCheck.add(acc.address));
      }

      const filteredAccountsArray = uniqueWritableAccountsArray.filter((addr) =>
        accountsToCheck.has(addr)
      );

      console.log(
        `Filtered ${uniqueWritableAccountsArray.length} accounts down to ${filteredAccountsArray.length} that need checking`
      );

      await Promise.all(
        chunks(filteredAccountsArray, 100).map(async (chunk) => {
          const accountInfos = await limiter(() =>
            retry(
              () =>
                connection.getMultipleAccountsInfo(
                  chunk.map((c) => new PublicKey(c)),
                  "finalized"
                ),
              retryOptions
            )
          );

          const accountInfosWithPk = accountInfos.map((accountInfo, idx) => ({
            pubkey: chunk[idx],
            ...accountInfo,
          }));

          // Dereference accountInfos after use
          accountInfos.length = 0;

          const accsByType: Record<string, typeof accountInfosWithPk> = {};
          accountInfosWithPk.forEach((accountInfo) => {
            const accName = accounts.find(
              ({ type }) =>
                accountInfo.data &&
                discriminatorsByType
                  .get(type)
                  ?.equals(accountInfo.data.subarray(0, 8))
            )?.type;

            if (accName) {
              accsByType[accName] = accsByType[accName] || [];
              accsByType[accName].push(accountInfo);
            }
          });

          // Dereference accountInfosWithPk after use
          accountInfosWithPk.length = 0;

          await Promise.all(
            Object.entries(accsByType).map(async ([accName, accounts]) => {
              const upserts: any[] = [];
              const model = sequelize.models[accName];
              const pubkeys = accounts.map((c) => c.pubkey);
              const existingAccs = await model.findAll({
                where: { address: pubkeys },
                transaction: t,
              });

              const existingAccMap = new Map(
                existingAccs.map((acc) => [acc.get("address"), acc])
              );

              limiter = pLimit(50);
              await Promise.all(
                accounts.map((acc) =>
                  limiter(async () => {
                    const existing = existingAccMap.get(acc.pubkey);
                    const refreshedAt = existing?.dataValues.refreshedAt
                      ? new Date(existing.dataValues.refreshedAt)
                      : null;

                    if (refreshedAt && refreshedAt > refreshThreshold) {
                      return;
                    }

                    const decodedAcc = program.coder.accounts.decode(
                      lowerFirstChar(accName),
                      acc.data as Buffer
                    );

                    let sanitized: {
                      refreshedAt: string;
                      address: string;
                      [key: string]: any;
                    } = {
                      refreshedAt: new Date().toISOString(),
                      address: acc.pubkey,
                      ...sanitizeAccount(decodedAcc),
                    };

                    for (const plugin of pluginsByAccountType[accName] || []) {
                      if (plugin?.processAccount) {
                        try {
                          sanitized = await plugin.processAccount(sanitized, t);
                        } catch (err) {
                          console.log(
                            `Plugin processing failed for account ${acc.pubkey}`,
                            err
                          );
                          return;
                        }
                      }
                    }

                    const existingData = existing?.dataValues;
                    const existingClean = _omit(existingData || {}, OMIT_KEYS);
                    const sanitizedClean = _omit(sanitized, OMIT_KEYS);
                    const shouldUpdate =
                      !deepEqual(sanitizedClean, existingClean) &&
                      (!refreshedAt || refreshedAt < snapshotTime);

                    if (shouldUpdate) {
                      const latestTxSignature = (txIdsByAccountId[acc.pubkey] ||
                        [])[0];

                      if (latestTxSignature) {
                        const latestTx = await connection.getTransaction(
                          latestTxSignature,
                          {
                            commitment: "finalized",
                            maxSupportedTransactionVersion: 0,
                          }
                        );

                        if (latestTx) {
                          if (latestTx.slot >= snapshotSlot) {
                            return;
                          }

                          if (latestTx.blockTime) {
                            if (
                              new Date(latestTx.blockTime * 1000) >=
                              snapshotTime
                            ) {
                              return;
                            }
                          }
                        }
                      }
                      const currentRecord = await model.findOne({
                        where: { address: acc.pubkey },
                        transaction: t,
                      });

                      const currentRefreshedAt = currentRecord?.dataValues
                        .refreshedAt
                        ? new Date(currentRecord.dataValues.refreshedAt)
                        : null;

                      if (
                        currentRefreshedAt &&
                        currentRefreshedAt > snapshotTime
                      ) {
                        return;
                      }

                      const changedFields = existing
                        ? Object.entries(sanitizedClean)
                            .filter(
                              ([key, value]) =>
                                !deepEqual(value, existingData[key])
                            )
                            .map(([key]) => key)
                        : Object.keys(sanitizedClean);

                      corrections.push({
                        type: accName,
                        accountId: acc.pubkey,
                        txSignatures: txIdsByAccountId[acc.pubkey] || [],
                        currentValues: existing
                          ? changedFields.reduce(
                              (obj, key) => ({
                                ...obj,
                                [key]: existingData[key],
                              }),
                              {}
                            )
                          : null,
                        newValues: changedFields.reduce(
                          (obj, key) => ({ ...obj, [key]: sanitized[key] }),
                          {}
                        ),
                      });

                      upserts.push(sanitized);
                    }
                  })
                )
              );

              if (upserts.length > 0) {
                await model.bulkCreate(upserts, {
                  updateOnDuplicate: [...Object.keys(upserts[0])],
                  transaction: t,
                });
              }
            })
          );
        })
      );

      await t.commit();
      console.log(`Integrity check complete for: ${programId}`);
      if (corrections.length > 0) {
        console.log(`Integrity check corrections for: ${programId}`);
        await Promise.all(
          corrections.map(async (correction) => {
            fastify.customMetrics.integrityCheckCounter.inc();
            console.dir(correction, { depth: null });
          })
        );
      }
    } catch (err) {
      await t.rollback();
      console.error(
        `Integrity check error while inserting for: ${programId}`,
        err
      );
      throw err; // Rethrow the error to be caught by the retry mechanism
    }
  };

  try {
    await retry(performIntegrityCheck, {
      ...retryOptions,
      onRetry: (error, attempt) => {
        console.log(
          `Integrity check ${programId} attempt ${attempt}: Retrying due to ${error.message}`
        );
      },
    });
  } catch (err) {
    console.error(
      `Failed to perform integrity check for ${programId} after multiple attempts:`,
      err
    );
    throw err;
  }
};
