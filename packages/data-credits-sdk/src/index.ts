import { DataCredits } from "../../../target/types/data_credits";
import { PublicKey } from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
} from "@project-serum/anchor";
import { PROGRAM_ID } from "./constants";
import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";
import { dataCreditsKey } from "./pdas";
import { heliumSubDaosResolvers } from "../../helium-sub-daos-sdk/src";


export async function init(provider: AnchorProvider, programId: PublicKey = PROGRAM_ID, idl?: any): Promise<Program<DataCredits>> {
  if (!idl) {
    idl = await Program.fetchIdl(
      programId,
      provider
    );
  }
  const dataCredits = new Program<DataCredits>(
    idl as DataCredits,
    programId,
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
        }),
        heliumSubDaosResolvers,
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
