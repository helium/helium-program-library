import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Sequelize } from "sequelize";
import database from "./database";

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
  const provider = anchor.AnchorProvider.env();
  const idl = await anchor.Program.fetchIdl(programId, provider);
  if (!idl) {
    throw new Error("unable to fetch idl");
  }

  const program = new anchor.Program(idl, programId, provider);
};
