import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { Sequelize } from "sequelize";
import { camelize } from "inflection";
import database from "./database";
import { provider } from "./solana";
import { defineIdlModels } from "./defineIdlModels";
import { sanitizeAccount } from "./santizeAccount";

interface UpsertProgramAccountsArgs {
  programId: PublicKey;
  idlAccountTypes: string[];
  accountAddress?: PublicKey;
  sequelize?: Sequelize;
}

export const upsertProgramAccounts = async ({
  programId,
  idlAccountTypes,
  accountAddress = null,
  sequelize = database,
}: UpsertProgramAccountsArgs) => {
  const idl = await anchor.Program.fetchIdl(programId, provider);

  if (!idl) {
    throw new Error(`unable to fetch idl for ${programId}`);
  }

  if (
    !idlAccountTypes.every((idlAccountType) =>
      idl.accounts.some(({ name }) => name === idlAccountType)
    )
  ) {
    throw new Error("idl does not have every idlAccountType");
  }

  const program = new anchor.Program(idl, programId, provider);
  let accsByIdlAccountType: {
    [key: string]: { publicKey: PublicKey; account: any }[];
  } = {};

  if (accountAddress) {
    if (idlAccountTypes.length > 1) {
      throw new Error("idlAccountTypes should be of length 1");
    }

    const [idlAccountType] = idlAccountTypes;
    const acc = await program.account[
      camelize(idlAccountType, true)
    ].fetchNullable(accountAddress);

    if (!acc) {
      throw new Error("unable to fetch ${accountType}");
    }

    accsByIdlAccountType[idlAccountType] = [
      {
        publicKey: accountAddress,
        account: acc,
      },
    ];
  } else {
    for (const idlAccountType of idlAccountTypes) {
      const filter: { offset?: number; bytes?: string; dataSize?: number } =
        program.coder.accounts.memcmp(idlAccountType, undefined);
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

      accsByIdlAccountType[idlAccountType] = resp
        .map(({ pubkey, account }) => {
          // ignore accounts we cant decode
          try {
            return {
              publicKey: pubkey,
              account: program.coder.accounts.decode(
                idlAccountType,
                account.data
              ),
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
    idlAccountTypes,
    sequelize,
  });

  for (const [idlAccountType, accs] of Object.entries(accsByIdlAccountType)) {
    if (accs.length > 0) {
      const model = sequelize.models[idlAccountType];
      await model.sync({ alter: true });
      await model.bulkCreate(
        accs.map(({ publicKey, account }) => ({
          address: publicKey.toBase58(),
          ...sanitizeAccount(account),
        })),
        { updateOnDuplicate: ["address"] }
      );
    }
  }
};
