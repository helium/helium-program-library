import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Sequelize } from "sequelize";
import { provider } from "./solana";
import database from "./database";
import { sanitizeAccount } from "./sanitizeAccount";
import cachedIdlFetch from "./cachedIdlFetch";
import { FastifyInstance } from "fastify";
import { IAccountConfig, IInitedPlugin } from "../types";
import pLimit from "p-limit";

interface HandleAccountWebhookArgs {
  fastify: FastifyInstance;
  programId: PublicKey;
  accounts: IAccountConfig[];
  account: any;
  sequelize?: Sequelize;
  pluginsByAccountType: Record<string, IInitedPlugin[]>;
}

// Ensure we never have more txns open than the pool size - 1
const limit = pLimit(
  (process.env.PG_POOL_SIZE ? Number(process.env.PG_POOL_SIZE) : 5) - 1
);
export function handleAccountWebhook({
  fastify,
  programId,
  accounts,
  account,
  sequelize = database,
  pluginsByAccountType,
}: HandleAccountWebhookArgs) {
  return limit(async () => {
    const idl = await cachedIdlFetch.fetchIdl({
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

      if (accName) {
        const decodedAcc = program.coder.accounts.decode(
          accName!,
          data as Buffer
        );
        let sanitized = sanitizeAccount(decodedAcc);
        for (const plugin of pluginsByAccountType[accName]) {
          if (plugin?.processAccount) {
            sanitized = await plugin.processAccount(sanitized, t);
          }
        }
        const model = sequelize.models[accName];
        await model.upsert(
          {
            address: account.pubkey,
            refreshed_at: now,
            ...sanitized,
          },
          { transaction: t }
        );
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
}
