import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { stakePositionKey, subDaoEpochInfoKey, subDaoKey } from "./pdas";
import {
  ataResolver,
  combineResolvers,
  get,
  heliumCommonResolver,
} from "@helium/spl-utils";
import { resolveIndividual } from "@helium/spl-utils";
import { PROGRAM_ID } from "./constants";
import { treasuryManagementResolvers } from "@helium/treasury-management-sdk";

const THREAD_PID = new PublicKey(
  "3XXuUFfweXBwFgFfYaejLvZE4cGZiHgKiGfMtdxNzYmv"
);

export const subDaoEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    if (path[path.length - 1] === "subDaoEpochInfo") {
      const clock = await provider.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      const unixTime = Number(clock!.data.readBigInt64LE(8 * 4));
      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        "subDao",
      ]) as PublicKey;
      if (subDao) {
        const [key] = await subDaoEpochInfoKey(subDao, unixTime, PROGRAM_ID);

        return key;
      }
    }
  }
);

export const heliumSubDaosProgramResolver = resolveIndividual(
  async ({ path }) => {
    if (
      path[path.length - 1] === "heliumSubDaos" ||
      path[path.length - 1] === "heliumSubDaosProgram"
    ) {
      return PROGRAM_ID;
    }
  }
);

export const heliumSubDaosResolvers = combineResolvers(
  heliumCommonResolver,
  subDaoEpochInfoResolver,
  heliumSubDaosProgramResolver,
  treasuryManagementResolvers,
  ataResolver({
    instruction: "initializeSubDaoV0",
    account: "treasury",
    mint: "hntMint",
    owner: "treasuryManagement",
  }),
  ataResolver({
    instruction: "initializeSubDaoV0",
    account: "stakerPool",
    mint: "dntMint",
    owner: "subDao",
  }),
  ataResolver({
    instruction: "claimRewardsV0",
    account: "stakerAta",
    mint: "dntMint",
    owner: "positionAuthority",
  }),
  ataResolver({
    account: "positionTokenAccount",
    mint: "mint",
    owner: "positionAuthority",
  }),
  resolveIndividual(async ({ args, path, accounts, idlIx }) => {
    if (path[path.length - 1] == "clockwork") {
      return THREAD_PID;
    }
  })
);
