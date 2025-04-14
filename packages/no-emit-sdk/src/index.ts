import { NoEmit } from "@helium/idls/lib/types/no_emit";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<NoEmit>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const program = new Program<NoEmit>(
    idl as NoEmit,
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
          instruction: "noEmitV0",
          account: "tokenAccount",
          mint: "mint",
          owner: "noEmitWallet",
        })
      );
    }
  ) as Program<NoEmit>;

  return program;
}
