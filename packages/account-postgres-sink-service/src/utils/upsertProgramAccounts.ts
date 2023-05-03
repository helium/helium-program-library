import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { Op, Sequelize } from "sequelize";
import { SOLANA_URL } from "../env";
import database from "./database";
import { defineIdlModels } from "./defineIdlModels";
import { sanitizeAccount } from "./sanitizeAccount";
import { chunks } from "@helium/spl-utils";

export type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

export const truthy = <T>(value: T): value is Truthy<T> => !!value;

interface UpsertProgramAccountsArgs {
  programId: PublicKey;
  accounts: {
    type: string;
    table?: string;
    schema?: string;
  }[];
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
  const idl = await anchor.Program.fetchIdl(programId, provider);

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

  const now = new Date().toISOString();
  for (const { type } of accounts) {
    const filter: { offset?: number; bytes?: string; dataSize?: number } =
      program.coder.accounts.memcmp(type, undefined);
    const coderFilters: GetProgramAccountsFilter[] = [];

    if (filter?.offset != undefined && filter?.bytes != undefined) {
      coderFilters.push({
        memcmp: { offset: filter.offset, bytes: filter.bytes },
      });
    }

    if (filter?.dataSize != undefined) {
      coderFilters.push({ dataSize: filter.dataSize });
    }

    console.log(`${type}, starting ${now}`);
    let resp = await provider.connection.getProgramAccounts(programId, {
      commitment: provider.connection.commitment,
      filters: [...coderFilters],
    });

    const model = sequelize.models[type];
    await model.sync({ alter: true });

    const respChunks = chunks(resp, 10000);
    for (const chunk of respChunks) {
      const t = await sequelize.transaction();
      const accs = chunk
        .map(({ pubkey, account }) => {
          // ignore accounts we cant decode
          try {
            return {
              publicKey: pubkey,
              account: program.coder.accounts.decode(type, account.data),
            };
          } catch (_e) {
            console.error(`Decode error ${pubkey.toBase58()}`, _e);
            return null;
          }
        })
        .filter(truthy);

      try {
        const updateOnDuplicateFields: string[] = Object.keys(accs[0].account);
        await model.bulkCreate(
          accs.map(({ publicKey, account }) => ({
            address: publicKey.toBase58(),
            refreshed_at: now,
            ...sanitizeAccount(account),
          })),
          {
            transaction: t,
            updateOnDuplicate: [
              "address",
              "refreshed_at",
              ...updateOnDuplicateFields,
            ],
          }
        );

        await model.destroy({
          transaction: t,
          where: {
            refreshed_at: {
              [Op.ne]: now,
            },
          },
        });

        await t.commit();
      } catch (err) {
        await t.rollback();
        console.error("While inserting, err", err);
        throw err;
      }
    }
  }
};
