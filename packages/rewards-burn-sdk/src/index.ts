import { RewardsBurn } from "@helium/idls/lib/types/rewards_burn";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { ataResolver, combineResolvers, heliumCommonResolver, resolveIndividual } from "@helium/anchor-resolvers";

export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<RewardsBurn>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const program = new Program<RewardsBurn>(
    idl as RewardsBurn,
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
        }),
        ataResolver({
          instruction: "burnV0",
          account: "tokenAccount",
          mint: "mint",
          owner: "burn"
        })
      )
    }
  ) as Program<RewardsBurn>;

  return program;
}
