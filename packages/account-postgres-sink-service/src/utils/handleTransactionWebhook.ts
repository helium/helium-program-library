import * as anchor from "@coral-xyz/anchor";
import {
  AddressLookupTableAccount,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { FastifyInstance } from "fastify";
import { camelize, humanize, titleize } from "inflection";
import pLimit from "p-limit";
import { Sequelize } from "sequelize";
import { IConfig } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import database from "./database";
import { provider } from "./solana";

interface HandleTransactionWebhookArgs {
  fastify: FastifyInstance;
  configs: IConfig[];
  transaction: VersionedTransaction;
  sequelize?: Sequelize;
}

// Ensure we never have more txns open than the pool size - 1
const limit = pLimit(
  (process.env.PG_POOL_SIZE ? Number(process.env.PG_POOL_SIZE) : 5) - 1
);

export const handleTransactionWebhoook = async ({
  fastify,
  configs,
  transaction,
  sequelize = database,
}: HandleTransactionWebhookArgs) => {
  return limit(async () => {
    const { message } = transaction;
    const { addressTableLookups } = message;
    const addressLookupTableAccounts: Array<AddressLookupTableAccount> = [];
    if (addressTableLookups.length > 0) {
      // eslint-disable-next-line no-restricted-syntax
      for (const addressTableLookup of addressTableLookups) {
        const result = await provider.connection?.getAddressLookupTable(
          addressTableLookup.accountKey
        );
        if (result?.value) {
          addressLookupTableAccounts.push(result?.value);
        }
      }
    }

    const { staticAccountKeys, accountKeysFromLookups } =
      message.getAccountKeys({
        addressLookupTableAccounts,
      });

    const accountKeys = [
      ...staticAccountKeys,
      ...(accountKeysFromLookups?.writable || []),
      ...(accountKeysFromLookups?.readonly || []),
    ];

    for (const ix of message.compiledInstructions) {
      const pIdIdx = ix.programIdIndex;
      const owner = new PublicKey(accountKeys[pIdIdx]).toBase58();
      const config = configs.find((x) => x.programId === owner);

      if (config) {
        const t = await sequelize.transaction();

        try {
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

          const coder = new anchor.BorshInstructionCoder(idl);
          const parsed = coder.decode(Buffer.from(ix.data), "base58");
          const accsWithIxSideEffects =
            parsed &&
            config.accounts.filter((cfg) =>
              cfg.ix_side_effects?.find(
                (effect) => camelize(effect.ix, true) === parsed.name
              )
            );

          if (accsWithIxSideEffects && accsWithIxSideEffects.length > 0) {
            const formatted = coder.format(
              parsed,
              ix.accountKeyIndexes.map((idx) => {
                const key = accountKeys[idx];
                return {
                  pubkey: new PublicKey(key),
                  isSigner: message.isAccountSigner(idx),
                  isWritable: message.isAccountWritable(idx),
                };
              })
            );

            if (formatted) {
              for (const acc of accsWithIxSideEffects) {
                const model = sequelize.models[acc.type];
                const ixSideEffects = acc.ix_side_effects!.filter(
                  (effect) => camelize(effect.ix, true) === parsed.name
                );

                for (const ixEffect of ixSideEffects) {
                  // only support delets
                  if (ixEffect.action === "delete") {
                    const pKey = formatted.accounts.find(
                      (acc) => acc.name === titleize(humanize(ixEffect.acc))
                    )?.pubkey;

                    if (pKey) {
                      console.log("Deleting", model.name, pKey.toBase58());
                      await model.destroy({
                        where: {
                          address: pKey.toBase58(),
                        },
                        transaction: t,
                      });
                    }
                  }
                }
              }
            }
          }

          await t.commit();
          // @ts-ignore
          fastify.customMetrics.transactionWebhookCounter.inc();
        } catch (err) {
          await t.rollback();
          console.error("While processing transaction", err);
          throw err;
        }
      }
    }
  });
};
