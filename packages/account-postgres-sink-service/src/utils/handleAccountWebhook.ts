import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import deepEqual from "deep-equal";
import { FastifyInstance } from "fastify";
import _omit from "lodash/omit";
import { Sequelize } from "sequelize";
import { IAccountConfig, IInitedPlugin } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import database, { limit } from "./database";
import { sanitizeAccount } from "./sanitizeAccount";
import { provider } from "./solana";
import { PG_POOL_SIZE } from "../env";

interface HandleAccountWebhookArgs {
  fastify: FastifyInstance;
  programId: PublicKey;
  accounts: IAccountConfig[];
  account: any;
  isDelete?: boolean;
  sequelize?: Sequelize;
  pluginsByAccountType: Record<string, IInitedPlugin[]>;
}

export const handleAccountWebhook = async ({
  fastify,
  programId,
  accounts,
  account,
  sequelize = database,
  pluginsByAccountType,
  isDelete = false,
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

    const t = await sequelize.transaction();
    const now = new Date().toISOString();
    try {
      const program = new anchor.Program(idl, programId, provider);
      const data = Buffer.from(account.data[0], account.data[1]);

      const accName = accounts.find(({ type }) => {
        return (
          data &&
          anchor.BorshAccountsCoder.accountDiscriminator(type).equals(
            data.subarray(0, 8)
          )
        );
      })?.type;

      if (!accName) {
        await t.rollback();
        return;
      }

      const decodedAcc = program.coder.accounts.decode(
        accName!,
        data as Buffer
      );

      const omitKeys = ["refreshed_at", "createdAt"];
      const model = sequelize.models[accName];
      const existing = await model.findByPk(account.pubkey);
      let sanitized = sanitizeAccount(decodedAcc);

      for (const plugin of pluginsByAccountType[accName]) {
        if (plugin?.processAccount) {
          sanitized = await plugin.processAccount(sanitized, t);
        }
      }

      if (isDelete) {
        await model.destroy({
          where: {
            address: account.pubkey,
          },
          transaction: t,
        });
      } else {
        const isEqual =
          existing &&
          deepEqual(
            _omit(sanitized, omitKeys),
            _omit(existing.dataValues, omitKeys)
          );

        if (!isEqual) {
          await model.upsert(
            {
              address: account.pubkey,
              refreshed_at: now,
              ...sanitized,
            },
            { transaction: t }
          );
        }
      }

      await t.commit();
      // @ts-ignore
      fastify.customMetrics.accountWebhookCounter.inc();
    } catch (err) {
      await t.rollback();
      console.error("While inserting, err", err);
      throw err;
    }
  });
};
