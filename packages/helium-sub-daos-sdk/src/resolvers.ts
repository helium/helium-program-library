import {
  ataResolver,
  combineResolvers,
  get,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { treasuryManagementResolvers } from "@helium/treasury-management-sdk";
import {
  init,
  PROGRAM_ID as VSR_PROGRAM_ID,
  vsrResolvers,
} from "@helium/voter-stake-registry-sdk";
import { AnchorProvider, BN, Provider } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { EPOCH_LENGTH, PROGRAM_ID } from "./constants";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import { init as initHsd } from "./init";
import { daoEpochInfoKey, subDaoEpochInfoKey } from "./pdas";
import { notEmittedCounterKey } from "@helium/no-emit-sdk";
import { min } from "bn.js";
import { getLockupEffectiveEndTs } from "./utils";

const THREAD_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);

export const daoEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts, args }) => {
    if (path[path.length - 1] === "daoEpochInfo" && accounts.registrar) {
      const vsr = await init(provider as AnchorProvider, VSR_PROGRAM_ID);
      let registrar;
      try {
        registrar = await vsr.account.registrar.fetch(
          accounts.registrar as PublicKey
        );
      } catch (e: any) {
        // ignore. It's fine, we just won't use time offset which is only used in testing cases
        console.error(e);
      }
      const clock = await provider.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      let unixTime;
      if (args && args[0] && args[0].epoch) {
        unixTime = args[0].epoch.toNumber() * EPOCH_LENGTH;
      } else {
        unixTime =
          Number(clock!.data.readBigInt64LE(8 * 4)) +
          (registrar?.timeOffset.toNumber() || 0);
      }
      const dao = get(accounts, [
        ...path.slice(0, path.length - 1),
        "dao",
      ]) as PublicKey;
      if (dao) {
        const [key] = await daoEpochInfoKey(dao, unixTime, PROGRAM_ID);

        return key;
      }
    }
    if (path[path.length - 1] == "prevDaoEpochInfo" && accounts.dao) {
      return daoEpochInfoKey(
        accounts.dao as PublicKey,
        (args[0].epoch.toNumber() - 1) * EPOCH_LENGTH
      )[0];
    }
    if (path[path.length - 1] === "notEmittedCounter" && accounts.hnt_mint) {
      return notEmittedCounterKey(accounts.hnt_mint as PublicKey)[0];
    }
  }
);

export const subDaoEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts, args }) => {
    const isOld = path[path.length - 1] === "oldSubDaoEpochInfo";
    const isNew = path[path.length - 1] === "subDaoEpochInfo";
    if ((isOld || isNew) && accounts.registrar) {
      const vsr = await init(provider as AnchorProvider, VSR_PROGRAM_ID);
      let registrar;
      try {
        registrar = await vsr.account.registrar.fetch(
          accounts.registrar as PublicKey
        );
      } catch (e: any) {
        // ignore. It's fine, we just won't use time offset which is only used in testing cases
        console.error(e);
      }
      const clock = await provider.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      let unixTime;
      if (args && args[0] && args[0].epoch) {
        unixTime = args[0].epoch.toNumber() * EPOCH_LENGTH;
      } else {
        unixTime =
          Number(clock!.data.readBigInt64LE(8 * 4)) +
          (registrar?.timeOffset.toNumber() || 0);
      }
      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        isNew ? "subDao" : "oldSubDao",
      ]) as PublicKey;
      if (subDao) {
        const [key] = subDaoEpochInfoKey(subDao, unixTime, PROGRAM_ID);

        return key;
      }
    }
    if (path[path.length - 1] === "prevSubDaoEpochInfo" && accounts.registrar) {
      const vsr = await init(provider as AnchorProvider, VSR_PROGRAM_ID);
      let registrar;
      try {
        registrar = await vsr.account.registrar.fetch(
          accounts.registrar as PublicKey
        );
      } catch (e: any) {
        // ignore. It's fine, we just won't use time offset which is only used in testing cases
        console.error(e);
      }
      const clock = await provider.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      let unixTime;
      if (args && args[0] && args[0].epoch) {
        unixTime = args[0].epoch.toNumber() * EPOCH_LENGTH;
      } else {
        unixTime =
          Number(clock!.data.readBigInt64LE(8 * 4)) +
          (registrar?.timeOffset.toNumber() || 0);
      }
      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        "subDao",
      ]) as PublicKey;
      if (subDao) {
        const [key] = subDaoEpochInfoKey(
          subDao,
          unixTime - EPOCH_LENGTH,
          PROGRAM_ID
        );

        return key;
      }
    }
    if (
      path[path.length - 1] === "prevSubDaoEpochInfo" &&
      args &&
      args[0] &&
      args[0].epoch
    ) {
      const unixTime = args[0].epoch.toNumber() * EPOCH_LENGTH;
      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        "subDao",
      ]) as PublicKey;
      if (subDao) {
        const [key] = subDaoEpochInfoKey(
          subDao,
          unixTime - EPOCH_LENGTH,
          PROGRAM_ID
        );

        return key;
      }
    }
  }
);

export const closingTimeEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    const isNew = path[path.length - 1] === "closingTimeSubDaoEpochInfo";
    const isOld = path[path.length - 1] === "oldClosingTimeSubDaoEpochInfo";
    if (isNew || isOld) {
      const program = await init(provider as AnchorProvider, VSR_PROGRAM_ID);
      const hsdProgram = await initHsd(provider as AnchorProvider);
      const nftProxyProgram = await initNftProxy(provider as AnchorProvider);

      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        isNew ? "subDao" : "oldSubDao",
      ]) as PublicKey;
      const position = get(accounts, [
        ...path.slice(0, path.length - 1),
        "position",
      ]) as PublicKey;
      const proxyConfig = get(accounts, [
        ...path.slice(0, path.length - 1),
        "proxyConfig",
      ]) as PublicKey;
      const delegatedPosition = get(accounts, [
        ...path.slice(0, path.length - 1),
        "delegatedPosition",
      ]) as PublicKey;
      const positionAcc =
        position && (await program.account.positionV0.fetch(position));
      const delegatedPositionAcc =
        delegatedPosition &&
        (await hsdProgram.account.delegatedPositionV0.fetchNullable(
          delegatedPosition
        ));
      const proxyConfigAcc =
        proxyConfig &&
        (await nftProxyProgram.account.proxyConfigV0.fetch(proxyConfig));
      const now = await getSolanaUnixTimestamp(provider);
      if (positionAcc && (proxyConfigAcc || delegatedPositionAcc)) {
        const expirationTs =
          !delegatedPositionAcc || delegatedPositionAcc.expirationTs.isZero()
            ? [...(proxyConfigAcc?.seasons || [])]
              ?.reverse()
              .find((s) => new BN(now.toString()).gte(s.start))?.end ||
            getLockupEffectiveEndTs(positionAcc.lockup)
            : delegatedPositionAcc.expirationTs;
        const [key] = subDaoEpochInfoKey(
          subDao,
          bnMin(getLockupEffectiveEndTs(positionAcc.lockup), expirationTs)
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
    const isNew = path[path.length - 1] === "genesisEndSubDaoEpochInfo";
    const isOld = path[path.length - 1] === "oldGenesisEndSubDaoEpochInfo";
    if (isNew || isOld) {
      const program = await init(provider as AnchorProvider, VSR_PROGRAM_ID);
      const hsdProgram = await initHsd(provider as AnchorProvider);
      const nftProxyProgram = await initNftProxy(provider as AnchorProvider);

      const subDao = get(accounts, [
        ...path.slice(0, path.length - 1),
        isNew ? "subDao" : "oldSubDao",
      ]) as PublicKey;
      const position = get(accounts, [
        ...path.slice(0, path.length - 1),
        "position",
      ]) as PublicKey;
      const registrar = get(accounts, [
        ...path.slice(0, path.length - 1),
        "registrar",
      ]) as PublicKey;
      const positionAcc =
        position && (await program.account.positionV0.fetch(position));
      const registrarAcc =
        registrar && (await program.account.registrar.fetch(registrar));
      const proxyConfig = get(accounts, [
        ...path.slice(0, path.length - 1),
        "proxyConfig",
      ]) as PublicKey;
      const delegatedPosition = get(accounts, [
        ...path.slice(0, path.length - 1),
        "delegatedPosition",
      ]) as PublicKey;
      const delegatedPositionAcc =
        delegatedPosition &&
        (await hsdProgram.account.delegatedPositionV0.fetchNullable(
          delegatedPosition
        ));
      const proxyConfigAcc =
        proxyConfig &&
        (await nftProxyProgram.account.proxyConfigV0.fetch(proxyConfig));
      if (positionAcc && registrarAcc) {
        const now =
          Number(await getSolanaUnixTimestamp(provider)) +
          registrarAcc.timeOffset.toNumber();
        const seasonEnd = [...(proxyConfigAcc?.seasons || [])]
          ?.reverse()
          .find((s) => new BN(now.toString()).gte(s.start))?.end;
        const expirationTs =
          !delegatedPositionAcc || delegatedPositionAcc.expirationTs.isZero()
            ? seasonEnd || getLockupEffectiveEndTs(positionAcc.lockup)
            : delegatedPositionAcc.expirationTs;
        const epochTs = positionAcc.genesisEnd.lte(new BN(now))
          ? min(getLockupEffectiveEndTs(positionAcc.lockup), expirationTs)
          : positionAcc.genesisEnd;
        const [key] = subDaoEpochInfoKey(subDao, epochTs);

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
  daoEpochInfoResolver,
  ataResolver({
    instruction: "initializeSubDaoV0",
    account: "treasury",
    mint: "hntMint",
    owner: "treasuryManagement",
  }),
  ataResolver({
    instruction: "initializeDaoV0",
    account: "delegatorPool",
    mint: "hntMint",
    owner: "dao",
  }),
  ataResolver({
    instruction: "claimRewardsV0",
    account: "delegatorAta",
    mint: "dntMint",
    owner: "positionAuthority",
  }),
  ataResolver({
    instruction: "claimRewardsV1",
    account: "delegatorAta",
    mint: "hntMint",
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
  ataResolver({
    instruction: "extendExpirationTsV0",
    account: "positionTokenAccount",
    mint: "mint",
    owner: "authority",
  }),
  resolveIndividual(async ({ path }) => {
    if (path[path.length - 1] == "clockwork") {
      return THREAD_PID;
    }
  }),
  vsrResolvers
);
function bnMin(a: BN, b: BN): BN {
  return a.lt(b) ? a : b;
}
