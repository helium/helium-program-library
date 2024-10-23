import {
  ataResolver,
  combineResolvers,
  get,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import {
  init,
  PROGRAM_ID as VSR_PROGRAM_ID,
  vsrResolvers,
} from "@helium/voter-stake-registry-sdk";
import { AnchorProvider, Provider } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { EPOCH_LENGTH, PROGRAM_ID } from "./constants";
import { vsrEpochInfoKey } from "./pdas";

export const vsrEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    if (path[path.length - 1] === "vsrEpochInfo" && accounts.registrar) {
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
      const unixTime =
        Number(clock!.data.readBigInt64LE(8 * 4)) +
        (registrar?.timeOffset.toNumber() || 0);
      const vetokenTracker = get(accounts, [
        ...path.slice(0, path.length - 1),
        "vetokenTracker",
      ]) as PublicKey;
      if (vetokenTracker) {
        const [key] = await vsrEpochInfoKey(vetokenTracker, unixTime, PROGRAM_ID);

        return key;
      }
    }
  }
);

export const closingTimeEpochInfoResolver = resolveIndividual(
  async ({ provider, path, accounts }) => {
    if (path[path.length - 1] === "closingTimeVsrEpochInfo") {
      const program = await init(provider as AnchorProvider, VSR_PROGRAM_ID);

      const vetokenTracker = get(accounts, [
        ...path.slice(0, path.length - 1),
        "vetokenTracker",
      ]) as PublicKey;
      const position = get(accounts, [
        ...path.slice(0, path.length - 1),
        "position",
      ]) as PublicKey;
      const positionAcc =
        position && (await program.account.positionV0.fetch(position));
      if (positionAcc) {
        const [key] = await vsrEpochInfoKey(
          vetokenTracker,
          positionAcc.lockup.endTs
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
    if (path[path.length - 1] === "genesisEndVsrEpochInfo") {
      const program = await init(provider as AnchorProvider, VSR_PROGRAM_ID);

      const vetokenTracker = get(accounts, [
        ...path.slice(0, path.length - 1),
        "vetokenTracker",
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
      if (positionAcc && registrarAcc) {
        const currTs =
          Number(await getSolanaUnixTimestamp(provider)) +
          registrarAcc.timeOffset.toNumber();
        const ts =
          positionAcc.genesisEnd.toNumber() < currTs
            ? positionAcc.lockup.endTs.toNumber()
            : positionAcc.genesisEnd;
        const [key] = await vsrEpochInfoKey(vetokenTracker, ts);

        return key;
      }
    }
  }
);

export const positionVotingRewardsResolvers = combineResolvers(
  heliumCommonResolver,
  vsrEpochInfoResolver,
  genesisEndEpochInfoResolver,
  closingTimeEpochInfoResolver,
  ataResolver({
    instruction: "claimRewardsV0",
    account: "enrolledAta",
    mint: "rewardsMint",
    owner: "positionAuthority",
  }),
  ataResolver({
    account: "positionTokenAccount",
    mint: "mint",
    owner: "positionAuthority",
  }),
  ataResolver({
    account: "rewardsPool",
    mint: "rewardsMint",
    owner: "vsrEpochInfo",
  }),
  ataResolver({
    instruction: "rewardForEpochV0",
    account: "payerAta",
    mint: "rewardsMint",
    owner: "rewardsPayer",
  }),
  vsrResolvers
);
