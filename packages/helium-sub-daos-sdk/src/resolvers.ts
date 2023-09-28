import {
  ataResolver,
  combineResolvers,
  get,
  heliumCommonResolver, resolveIndividual
} from "@helium/anchor-resolvers";
import { treasuryManagementResolvers } from "@helium/treasury-management-sdk";
import { init, PROGRAM_ID as VSR_PROGRAM_ID, vsrResolvers } from "@helium/voter-stake-registry-sdk";
import { AnchorProvider, Provider } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { EPOCH_LENGTH, PROGRAM_ID } from "./constants";
import { daoEpochInfoKey, subDaoEpochInfoKey } from "./pdas";

const THREAD_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);

export const subDaoEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    if (path[path.length - 1] === "subDaoEpochInfo" && accounts.registrar) {
      const vsr = await init(provider as AnchorProvider, VSR_PROGRAM_ID);
      let registrar;
      try {
        registrar = await vsr.account.registrar.fetch(accounts.registrar as PublicKey);
      } catch (e: any) {
        // ignore. It's fine, we just won't use time offset which is only used in testing cases
        console.error(e)
      }
      const clock = await provider.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      const unixTime = Number(clock!.data.readBigInt64LE(8 * 4)) + (registrar?.timeOffset.toNumber() || 0);
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

export const closingTimeEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    if (path[path.length - 1] === "closingTimeSubDaoEpochInfo") {
      const program = await init(
        provider as AnchorProvider,
        VSR_PROGRAM_ID,
      );

      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        "subDao",
      ]) as PublicKey;
      const position = get(accounts, [
        ...path.slice(0, path.length - 1),
        "position",
      ]) as PublicKey;
      const positionAcc = position && await program.account.positionV0.fetch(
        position
      );
      if (positionAcc) {
        const [key] = await subDaoEpochInfoKey(
          subDao,
          positionAcc.lockup.endTs,
        );

        return key;
      }
    }
  }
);

async function getSolanaUnixTimestamp(provider: Provider): Promise<bigint> {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}


export const genesisEndEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    if (path[path.length - 1] === "genesisEndSubDaoEpochInfo") {
      const program = await init(provider as AnchorProvider, VSR_PROGRAM_ID);

      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        "subDao",
      ]) as PublicKey;
      const position = get(accounts, [
        ...path.slice(0, path.length - 1),
        "position",
      ]) as PublicKey;
      const registrar = get(accounts, [
        ...path.slice(0, path.length - 1),
        "registrar",
      ]) as PublicKey;
      const positionAcc = position && await program.account.positionV0.fetch(position);
      const registrarAcc = registrar && await program.account.registrar.fetch(registrar);
      if (positionAcc && registrarAcc) {
        const currTs = Number(await getSolanaUnixTimestamp(provider)) + registrarAcc.timeOffset.toNumber();
        const ts =
          positionAcc.genesisEnd.toNumber() < currTs
            ? positionAcc.lockup.endTs.toNumber()
            : positionAcc.genesisEnd;
        const [key] = await subDaoEpochInfoKey(
          subDao,
          ts
        );

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
  genesisEndEpochInfoResolver,
  closingTimeEpochInfoResolver,
  treasuryManagementResolvers,
  ataResolver({
    instruction: "initializeSubDaoV0",
    account: "treasury",
    mint: "hntMint",
    owner: "treasuryManagement",
  }),
  ataResolver({
    instruction: "initializeSubDaoV0",
    account: "delegatorPool",
    mint: "dntMint",
    owner: "subDao",
  }),
  ataResolver({
    instruction: "claimRewardsV0",
    account: "delegatorAta",
    mint: "dntMint",
    owner: "positionAuthority",
  }),
  ataResolver({
    instruction: "tempClaimFailedClaims",
    account: "delegatorAta",
    mint: "dntMint",
    owner: "positionAuthority",
  }),
  ataResolver({
    account: "positionTokenAccount",
    mint: "mint",
    owner: "positionAuthority",
  }),
  resolveIndividual(async ({ args, path, accounts }) => {
    if (path[path.length - 1] == "clockwork") {
      return THREAD_PID;
    } else if (path[path.length - 1] == "prevDaoEpochInfo" && accounts.dao) {
      return daoEpochInfoKey(
        accounts.dao as PublicKey,
        (args[0].epoch.toNumber() - 1) * EPOCH_LENGTH
      )[0];
    }
  }),
  vsrResolvers
);
