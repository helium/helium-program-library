import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { realmNames } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { registrarKey, vsrResolvers } from "./resolvers";
export * from "./constants";
export { getPositionKeysForOwner } from "./helpers";
export * from "./pdas";
export * from "./resolvers";
export { VoteService } from "./voteService";
export type {
  EnhancedProxy, EnhancedProxyData, PartialEnhancedProxy, ProposalWithVotes,
  ProxyAssignment, WithRank
} from "./voteService";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export function getRegistrarKey(mint: PublicKey) {
  return registrarKey(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance", "utf-8"),
        Buffer.from(realmNames[mint.toBase58()], "utf-8"),
      ],
      new PublicKey("hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S")
    )[0],
    mint
  )[0];
}

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<VoterStakeRegistry>> => {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
  }

  const heliumVoterStakeRegistry = new Program<VoterStakeRegistry>(
    idl as VoterStakeRegistry,
    provider,
    undefined,
    () => {
      return vsrResolvers;
    }
  ) as Program<VoterStakeRegistry>;

  return heliumVoterStakeRegistry;
};

export function isClaimed({
  epoch,
  lastClaimedEpoch,
  claimedEpochsBitmap
}: {
  epoch: number,
  lastClaimedEpoch: number,
  claimedEpochsBitmap: BN,
}): boolean {
  if (epoch <= lastClaimedEpoch) {
    return true
  } else if (epoch > lastClaimedEpoch + 128) {
    return false
  } else {
    const bitIndex: number = epoch - lastClaimedEpoch - 1;
    return claimedEpochsBitmap.shrn(127 - bitIndex).and(new BN(1)).toNumber() === 1;
  }
}
