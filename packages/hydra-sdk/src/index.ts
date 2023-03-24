import { Hydra } from "./hydra";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { hydraResolvers } from "./resolvers";
import { BN } from "bn.js";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<Hydra>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }
  const program = new Program<Hydra>(
    idl as Hydra,
    programId ?? PROGRAM_ID,
    provider,
    undefined,
    () => {
      return hydraResolvers;
    }
  ) as Program<Hydra>;

  return program;
}

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";
