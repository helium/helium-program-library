import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { combineResolvers, heliumCommonResolver, resolveIndividual } from "@helium/anchor-resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<RewardsOracle>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const program = new Program<RewardsOracle>(
    idl as RewardsOracle,
    programId,
    provider,
    undefined,
    () => {
      return combineResolvers(
        heliumCommonResolver,
        resolveIndividual(async ({ path }) => {
          if (path[path.length - 1] == "lazyDistributorProgram") {
            return new PublicKey("1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w");
          }
        })
      )
    }
  ) as Program<RewardsOracle>;

  return program;
}
