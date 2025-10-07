import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import deepEqual from "deep-equal";
import { FastifyInstance } from "fastify";
import _omit from "lodash/omit";
import { Sequelize, Transaction } from "sequelize";
import { IAccountConfig, IInitedPlugin } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import database, { limit } from "./database";
import { sanitizeAccount } from "./sanitizeAccount";
import { provider } from "./solana";
import { OMIT_KEYS } from "../constants";
import { lowerFirstChar } from "@helium/spl-utils";
import retry from "async-retry";

interface HandleAccountWebhookArgs {
  fastify: FastifyInstance;
  programId: PublicKey;
  accounts: IAccountConfig[];
  account: {
    pubkey: string;
    data: any;
  };
  isDelete?: boolean;
  sequelize?: Sequelize;
  pluginsByAccountType: Record<string, IInitedPlugin[]>;
  block?: number | null;
}

export const handleAccountWebhook = async ({
  fastify,
  programId,
  accounts,
  account,
  sequelize = database,
  pluginsByAccountType,
  isDelete = false,
  block,
}: HandleAccountWebhookArgs) => {
  return limit(async () => {
    const idl = await cachedIdlFetch.fetchIdl({
      programId: programId.toBase58(),
      provider,
    });

    if (!idl) {
      throw new Error(`unable to fetch idl for ${programId.toBase58()}`);
    }

    if (
      !accounts.every(({ type }) =>
        idl.accounts!.some(({ name }) => name === type)
      )
    ) {
      throw new Error("idl does not have every account type");
    }

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      if (isDelete) {
        const modelsToDelete = accounts
          .filter((accountConfig) => !accountConfig.ignore_deletes)
          .map((accountConfig) => accountConfig.type)
          .filter((modelName) => {
            const hasAddressAttribute =
              !!sequelize.models[modelName]?.getAttributes().address;
            return hasAddressAttribute;
          });

        const deletePromises = modelsToDelete.map((modelName) => {
          return sequelize.models[modelName].destroy({
            where: { address: account.pubkey },
            transaction: t,
          });
        });

        await Promise.all(deletePromises);
        await t.commit();
        fastify.customMetrics.accountWebhookCounter.inc();
        return;
      }

      const program = new anchor.Program(idl, provider);
      const data = Buffer.from(account.data[0], account.data[1]);
      const accName = accounts.find(({ type }) => {
        return (
          data &&
          (program.coder.accounts as anchor.BorshAccountsCoder)
            .accountDiscriminator(lowerFirstChar(type))
            .equals(data.subarray(0, 8))
        );
      })?.type;

      if (!accName) {
        await t.rollback();
        return;
      }

      const decodedAcc = program.coder.accounts.decode(
        lowerFirstChar(accName),
        data as Buffer
      );
      const model = sequelize.models[accName];
      const existing = await model.findByPk(account.pubkey, {
        transaction: t,
      });

      let sanitized = sanitizeAccount(decodedAcc);

      // Use provided block or fetch from RPC if not available
      let lastBlock: number = block ?? 0;
      const hasPlugins = (pluginsByAccountType[accName] || []).length > 0;

      if (hasPlugins && lastBlock === 0) {
        try {
          lastBlock = await retry(
            () => provider.connection.getSlot("finalized"),
            {
              retries: 3,
              factor: 2,
              minTimeout: 1000,
              maxTimeout: 5000,
            }
          );
        } catch (error) {
          console.warn("Failed to fetch block for plugins:", error);
        }
      }

      for (const plugin of pluginsByAccountType[accName] || []) {
        if (plugin?.processAccount) {
          try {
            sanitized = await plugin.processAccount(
              { address: account.pubkey, ...sanitized },
              t,
              lastBlock
            );
          } catch (err) {
            console.log(
              `Plugin processing failed for account ${account.pubkey}`,
              err
            );
            // Continue with unmodified sanitized data instead of failing
            continue;
          }
        }
      }

      sanitized = {
        refreshedAt: new Date().toISOString(),
        address: account.pubkey,
        ...sanitized,
      };

      const shouldUpdate = !deepEqual(
        _omit(sanitized, OMIT_KEYS),
        _omit(existing?.dataValues, OMIT_KEYS)
      );

      if (shouldUpdate) {
        // Use the block we already have, or fetch it now if we haven't and it wasn't provided
        if (lastBlock === 0) {
          try {
            lastBlock = await retry(
              () => provider.connection.getSlot("finalized"),
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
        }

        await model.upsert(
          {
            ...sanitized,
            lastBlock,
          },
          { transaction: t }
        );
      }

      await t.commit();
      fastify.customMetrics.accountWebhookCounter.inc();
    } catch (err) {
      await t.rollback();
      console.error("While inserting, err", err);
      throw err;
    }
  });
};
