import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { Sequelize, Op } from "sequelize";
import { camelize } from "inflection";
import database from "./database";
import { defineIdlModels } from "./defineIdlModels";
import { sanitizeAccount } from "./sanitizeAccount";
import { SOLANA_URL } from "../env";

interface UpsertProgramAccountsArgs {
  programId: PublicKey;
  accounts: {
    type: string;
    table?: string;
    schema?: string;
  }[];
  accountAddress?: PublicKey;
  sequelize?: Sequelize;
}

export const upsertProgramAccounts = async ({
  programId,
  accounts,
  accountAddress = null,
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
      idl.accounts.some(({ name }) => name === type)
    )
  ) {
    throw new Error("idl does not have every account type");
  }

  const program = new anchor.Program(idl, programId, provider);
  let accsByIdlAccountType: {
    [key: string]: { publicKey: PublicKey; account: any }[];
  } = {};

  if (accountAddress) {
    if (accounts.length > 1) {
      throw new Error("accounts should be of length 1");
    }

    const [{ type }] = accounts;
    const acc = await program.account[camelize(type, true)].fetchNullable(
      accountAddress
    );

    if (!acc) {
      throw new Error(`unable to fetch ${type}`);
    }

    accsByIdlAccountType[type] = [
      {
        publicKey: accountAddress,
        account: acc,
      },
    ];
  } else {
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

      let resp = await provider.connection.getProgramAccounts(programId, {
        commitment: provider.connection.commitment,
        filters: [...coderFilters],
      });

      accsByIdlAccountType[type] = resp
        .map(({ pubkey, account }) => {
          // ignore accounts we cant decode
          try {
            return {
              publicKey: pubkey,
              account: program.coder.accounts.decode(type, account.data),
            };
          } catch (_e) {
            return null;
          }
        })
        .filter(Boolean);
    }
  }

  await sequelize.authenticate();
  await defineIdlModels({
    idl,
    accounts,
    sequelize,
  });

  for (const [idlAccountType, accs] of Object.entries(accsByIdlAccountType)) {
    const model = sequelize.models[idlAccountType];
    await model.sync({ alter: true });

    if (accs.length > 0) {
      const addresses = accs.map(({ publicKey }) => publicKey.toBase58());
      const t = await sequelize.transaction();

      try {
        const updateOnDuplicateFields: string[] = Object.keys(accs[0].account);
        const now = new Date().toISOString();

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
        throw err;
      }
    } else {
      await model.destroy({
        where: {},
        truncate: true,
      });
    }
  }
};
