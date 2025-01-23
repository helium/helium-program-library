import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import retry, { Options as RetryOptions } from "async-retry";
import deepEqual from "fast-deep-equal";
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
    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });
    const txIdsByAccountId: { [key: string]: string[] } = {};
    const corrections: {
      type: string;
      accountId: string;
      txSignatures: string[];
      currentValues: null | { [key: string]: any };
      newValues: { [key: string]: any };
    }[] = [];

    try {
      const program = new anchor.Program(idl, programId, provider);
      const currentSlot = await connection.getSlot();
      const twentyFourHoursAgoSlot =
        currentSlot - Math.floor((24 * 60 * 60 * 1000) / 400); // (assuming a slot duration of 400ms)
      const blockTime24HoursAgo = await getBlockTimeWithRetry({
        slot: twentyFourHoursAgoSlot,
        provider,
      });

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

      await Promise.all(
        chunks(accountInfosWithPk, 1000).map(async (chunk) => {
          for (const c of chunk) {
            const accName = accounts.find(({ type }) => {
              return (
                c.data &&
                anchor.BorshAccountsCoder.accountDiscriminator(type).equals(
                  c.data.subarray(0, 8)
                )
              );
            })?.type;

            if (!accName) {
              continue;
            }

            const decodedAcc = program.coder.accounts.decode(
              accName!,
              c.data as Buffer
            );

            if (accName) {
              const model = sequelize.models[accName];
              const existing = await model.findByPk(c.pubkey, {
                transaction: t,
              });

              let sanitized = {
                refreshed_at: new Date().toISOString(),
                address: c.pubkey,
                ...sanitizeAccount(decodedAcc),
              };

              for (const plugin of pluginsByAccountType[accName]) {
                if (plugin?.processAccount) {
                  sanitized = await plugin.processAccount(sanitized);
                }
              }

              const shouldUpdate = !deepEqual(
                _omit(sanitized, OMIT_KEYS),
                _omit(existing?.dataValues, OMIT_KEYS)
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
            }
          }
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
        console.warn(
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
