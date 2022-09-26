import { DataCredits } from "../../../target/types/data_credits";
import { PublicKey } from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
} from "@project-serum/anchor";
import { PROGRAM_ID } from "./constants";


export async function init(provider: AnchorProvider, dataCreditsProgramId: PublicKey = PROGRAM_ID) {
  const dataCreditsIdlJson = await Program.fetchIdl(
    dataCreditsProgramId,
    provider
  );
  const dataCredits = new Program<DataCredits>(
    dataCreditsIdlJson as DataCredits,
    dataCreditsProgramId,
    provider
  ) as Program<DataCredits>;
  return dataCredits;
}

export * from "./instructions";
export * from "./pdas"
