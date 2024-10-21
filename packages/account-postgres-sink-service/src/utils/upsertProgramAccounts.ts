import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import pLimit from "p-limit";
import { Op, Sequelize } from "sequelize";
import { SOLANA_URL } from "../env";
import { initPlugins } from "../plugins";
import { IAccountConfig } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import { chunks } from "./chunks";
import database from "./database";
import { defineIdlModels } from "./defineIdlModels";
import { sanitizeAccount } from "./sanitizeAccount";
import { truthy } from "./truthy";

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

  const program = new anchor.Program(idl, programId, provider);

  try {
    await sequelize.authenticate();
    await defineIdlModels({
      idl,
      accounts,
      sequelize,
    });
  } catch (e) {
    console.log(e);
  }

  await Promise.all(
    accounts.map(async ({ type, batchSize = 2500, ...rest }) => {
      try {
        const filter: {
          offset?: number;
          bytes?: string;
          dataSize?: number;
        } = program.coder.accounts.memcmp(type, undefined);
        const coderFilters: GetProgramAccountsFilter[] = [];
        const plugins = await initPlugins(rest.plugins);
        if (filter?.offset != undefined && filter?.bytes != undefined) {
          coderFilters.push({
            memcmp: { offset: filter.offset, bytes: filter.bytes },
          });
        }

        if (filter?.dataSize != undefined) {
          coderFilters.push({ dataSize: filter.dataSize });
        }

        let resp = await provider.connection.getProgramAccounts(programId, {
          commitment: provider.connection.commitment,
          filters: [...coderFilters],
        });
        const model = sequelize.models[type];
        const t = await sequelize.transaction();
        // @ts-ignore
        const respChunks = chunks(resp, batchSize);
        const now = new Date().toISOString();
        const limit = pLimit(Number(process.env.PG_POOL_SIZE) || 20);

        try {
          const processingPromises = respChunks.map((c) =>
            limit(async () => {
              const accs = c
                .map(({ pubkey, account }) => {
                  // ignore accounts we cant decode
                  try {
                    const decodedAcc = program.coder.accounts.decode(
                      type,
                      account.data
                    );

                    return {
                      publicKey: pubkey,
                      account: decodedAcc,
                    };
                  } catch (_e) {
                    console.error(`Decode error ${pubkey.toBase58()}`, _e);
                    return null;
                  }
                })
                .filter(truthy);

              const updateOnDuplicateFields: string[] = [
                ...Object.keys(accs[0].account),
                ...[
                  ...new Set(
                    plugins
                      .map((plugin) => plugin?.updateOnDuplicateFields || [])
                      .flat()
                  ),
                ],
              ];

              const values = await Promise.all(
                accs.map(async ({ publicKey, account }) => {
                  let sanitizedAccount = sanitizeAccount(account);

                  for (const plugin of plugins) {
                    if (plugin?.processAccount) {
                      sanitizedAccount = await plugin.processAccount(
                        sanitizedAccount
                      );
                    }
                  }

                  return {
                    address: publicKey.toBase58(),
                    refreshed_at: now,
                    ...sanitizedAccount,
                  };
                })
              );

              await model.bulkCreate(values, {
                transaction: t,
                updateOnDuplicate: [
                  "address",
                  "refreshed_at",
                  ...updateOnDuplicateFields,
                ],
              });
            })
          );

          await Promise.all(processingPromises);
          await t.commit();
        } catch (err) {
          await t.rollback();
          console.error("While inserting, err", err);
          throw err;
        }

        await model.destroy({
          where: {
            refreshed_at: {
              [Op.lt]: now,
            },
          },
        });
      } catch (err) {
        console.error(`Error processing account type ${type}:`, err);
        throw err;
      }
    })
  );
};
