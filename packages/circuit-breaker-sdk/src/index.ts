import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PROGRAM_ID } from "./constants";
import { circuitBreakerResolvers } from "./resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export const ThresholdType = {
  Percent: { percent: {} },
  Absolute: { absolute: {} }
};

const MAX_U64 = new BN("18446744073709551615");

export function thresholdPercent(percent: number): BN {
  return new BN(percent).mul(MAX_U64).div(new BN(100));
}

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<CircuitBreaker>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const circuitBreaker = new Program<CircuitBreaker>(
    idl as CircuitBreaker,
    provider,
    undefined,
    () => circuitBreakerResolvers
  ) as Program<CircuitBreaker>;

  return circuitBreaker;
}
