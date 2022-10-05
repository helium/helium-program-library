import { DataCredits } from "@helium-foundation/idls/lib/esm/data_credits";
import { PublicKey } from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
} from "@project-serum/anchor";
import { PROGRAM_ID } from "./constants";
import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";
import { dataCreditsKey } from "./pdas";


export async function init(provider: AnchorProvider, dataCreditsProgramId: PublicKey = PROGRAM_ID, dataCreditsIdl?: any): Promise<Program<DataCredits>> {
  if (!dataCreditsIdl) {
    dataCreditsIdl = await Program.fetchIdl(
      dataCreditsProgramId,
      provider
    );
  }
  const dataCredits = new Program<DataCredits>(
    dataCreditsIdl as DataCredits,
    dataCreditsProgramId,
    provider,
    undefined,
    () => {
      return combineResolvers(
        ataResolver({
          instruction: "mintDataCreditsV0",
          account: "recipientTokenAccount",
          mint: "dcMint",
          owner: "recipient",
        }),
        ataResolver({
          instruction: "mintDataCreditsV0",
          account: "burner",
          mint: "hntMint",
          owner: "owner",
        })
      )
    }
  ) as Program<DataCredits>;
  return dataCredits;
}

export async function isInitialized(program: Program<DataCredits>) {
  if (await program.provider.connection.getAccountInfo(dataCreditsKey()[0])) {
    return true
  }
  return false;
}

export * from "./instructions";
export * from "./pdas";
export * from "./constants";
