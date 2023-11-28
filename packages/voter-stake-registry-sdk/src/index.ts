import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { registrarKey, vsrResolvers } from "./resolvers";
import { PROGRAM_ID } from "./constants";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
export * from "./constants";
export * from "./pdas";
export * from "./resolvers";
export { VoteService } from "./voteService";
export type {
  ProposalWithVotes,
  Delegation,
  Proxy,
  EnhancedProxy,
  EnhancedProxyData,
} from "./voteService";

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

const realmNames: Record<string, string> = {
  [HNT_MINT.toBase58()]: "Helium",
  [MOBILE_MINT.toBase58()]: "Helium MOBILE",
  [IOT_MINT.toBase58()]: "Helium IOT",
};

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<VoterStakeRegistry>> => {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const heliumVoterStakeRegistry = new Program<VoterStakeRegistry>(
    idl as VoterStakeRegistry,
    programId,
    provider,
    undefined,
    () => {
      return vsrResolvers;
    }
  ) as Program<VoterStakeRegistry>;

  return heliumVoterStakeRegistry;
};
