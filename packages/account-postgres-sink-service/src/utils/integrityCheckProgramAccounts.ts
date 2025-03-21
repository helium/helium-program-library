import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import retry, { Options as RetryOptions } from "async-retry";
import deepEqual from "deep-equal";
import { FastifyInstance } from "fastify";
import _omit from "lodash/omit";
import pLimit from "p-limit";
import { Sequelize, Transaction } from "sequelize";
import { SOLANA_URL } from "../env";
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
    const startTime = new Date();
    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      const program = new anchor.Program(idl, provider);
      const currentSlot = await connection.getSlot();
      let blockTime24HoursAgo: number | null = null;
      let attemptSlot = currentSlot - Math.floor((24 * 60 * 60 * 1000) / 400); // Slot 24hrs ago (assuming a slot duration of 400ms);
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

      if (!blockTime24HoursAgo) {
        throw new Error("Unable to get blocktime from 24 hours ago");
      }

      const parsedTransactions = (
        await Promise.all(
          chunks(
            await getTransactionSignaturesUptoBlockTime({
              programId,
              blockTime: blockTime24HoursAgo,
              provider,
            }),
            100
          ).map((chunk) =>
            retry(
              () =>
                connection.getParsedTransactions(chunk, {
                  commitment: "finalized",
                  maxSupportedTransactionVersion: 0,
                }),
              retryOptions
            )
          )
        )
      ).flat();

      const uniqueWritableAccounts = new Set<string>();
      for (const parsed of parsedTransactions) {
        parsed?.transaction.message.accountKeys
          .filter((acc) => acc.writable)
          .map((acc) => {
            uniqueWritableAccounts.add(acc.pubkey.toBase58());
            txIdsByAccountId[acc.pubkey.toBase58()] = [
              ...parsed.transaction.signatures,
              ...(txIdsByAccountId[acc.pubkey.toBase58()] || []),
            ];
          });
      }

      const accountInfosWithPk = (
        await Promise.all(
          chunks([...uniqueWritableAccounts.values()], 100).map((chunk) =>
            pLimit(100)(() =>
              retry(
                () =>
                  connection.getMultipleAccountsInfo(
                    chunk.map((c) => new PublicKey(c)),
                    "confirmed"
                  ),
                retryOptions
              )
            )
          )
        )
      )
        .flat()
        .map((accountInfo, idx) => ({
          pubkey: [...uniqueWritableAccounts.values()][idx],
          ...accountInfo,
        }));

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
          (program.coder.accounts as anchor.BorshAccountsCoder).accountDiscriminator(lowerFirstChar(type)),
        ])
      );

      await Promise.all(
        chunks(accountInfosWithPk, 1000).map(async (chunk) => {
          const accountsByType: Record<string, typeof accountInfosWithPk> = {};
          chunk.forEach((accountInfo) => {
            const accName = accounts.find(
              ({ type }) =>
                accountInfo.data &&
                discriminatorsByType
                  .get(type)
                  ?.equals(accountInfo.data.subarray(0, 8))
            )?.type;

            if (accName) {
              accountsByType[accName] = accountsByType[accName] || [];
              accountsByType[accName].push(accountInfo);
            }
          });

          await Promise.all(
            Object.entries(accountsByType).map(async ([accName, accounts]) => {
              const model = sequelize.models[accName];
              await Promise.all(
                accounts.map(async (c) => {
                  const decodedAcc = program.coder.accounts.decode(
                    lowerFirstChar(accName),
                    c.data as Buffer
                  );

                  let sanitized = {
                    refreshed_at: new Date().toISOString(),
                    address: c.pubkey,
                    ...sanitizeAccount(decodedAcc),
                  };

                  for (const plugin of pluginsByAccountType[accName] || []) {
                    if (plugin?.processAccount) {
                      try {
                        sanitized = await plugin.processAccount(sanitized, t);
                      } catch (err) {
                        console.log(
                          `Plugin processing failed for account ${c.pubkey}`,
                          err
                        );
                        // Continue with unmodified sanitized data instead of failing
                        continue;
                      }
                    }
                  }

                  const existing = await model.findByPk(c.pubkey, {
                    transaction: t,
                  });

                  const shouldUpdate =
                    !deepEqual(
                      _omit(sanitized, OMIT_KEYS),
                      _omit(existing?.dataValues, OMIT_KEYS)
                    ) &&
                    !(
                      existing?.dataValues.refreshed_at &&
                      new Date(existing.dataValues.refreshed_at) >= startTime &&
                      new Date(existing.dataValues.refreshed_at) <= new Date()
                    );

                  if (shouldUpdate) {
                    corrections.push({
                      type: accName,
                      accountId: c.pubkey,
                      txSignatures: txIdsByAccountId[c.pubkey],
                      currentValues: existing ? existing.dataValues : null,
                      newValues: sanitized,
                    });
                    await model.upsert({ ...sanitized }, { transaction: t });
                  }
                })
              );
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
            // @ts-ignore
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
