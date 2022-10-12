import { CircuitBreaker } from "@helium-foundation/idls/lib/types/circuit_breaker";
import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { circuitBreakerResolvers } from "./resolvers";


export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<CircuitBreaker>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const circuitBreaker = new Program<CircuitBreaker>(
    idl as CircuitBreaker,
    programId,
    provider,
    undefined,
    () => circuitBreakerResolvers
  ) as Program<CircuitBreaker>;

  return circuitBreaker;
}
