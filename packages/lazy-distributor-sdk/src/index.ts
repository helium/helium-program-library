import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { lazyDistributorResolvers } from "./resolvers";

export { distributeCompressionRewards } from "./functions/distributeCompressionRewards";
export { initializeCompressionRecipient } from "./functions/initializeCompressionRecipient";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null,
): Promise<Program<LazyDistributor>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }
  const lazyDistributor = new Program<LazyDistributor>(
    idl as LazyDistributor,
    programId,
    provider,
    undefined,
    () => {
      return lazyDistributorResolvers;
    }
  ) as Program<LazyDistributor>;
  return lazyDistributor;
}

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";
