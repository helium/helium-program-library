import { Idl, Provider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import circuitBreakerIdl from "./idl/circuit_breaker.json";
import dataCreditsIdl from "./idl/data_credits.json";
import fanoutIdl from "./idl/fanout.json";
import heliumEntityManagerIdl from "./idl/helium_entity_manager.json";
import heliumSubDaosIdl from "./idl/helium_sub_daos.json";
import hexboostingIdl from "./idl/hexboosting.json";
import lazyDistributorIdl from "./idl/lazy_distributor.json";
import lazyTransactionsIdl from "./idl/lazy_transactions.json";
import mobileEntityManagerIdl from "./idl/mobile_entity_manager.json";
import noEmitIdl from "./idl/no_emit.json";
import priceOracleIdl from "./idl/price_oracle.json";
import rewardsOracleIdl from "./idl/rewards_oracle.json";
import treasuryManagementIdl from "./idl/treasury_management.json";
import voterStakeRegistryIdl from "./idl/voter_stake_registry.json";

export async function fetchBackwardsCompatibleIdl(
  programId: PublicKey,
  provider: Provider
) {
  const idl = await Program.fetchIdl(programId, provider);
  return useBackwardsCompatibleIdl(programId, idl);
}

export function useBackwardsCompatibleIdl(
  programId: PublicKey,
  idl: Idl | null | undefined,
) {
  // This is an Anchor 0.30+ IDL. Return the old IDLs
  if (!idl || !idl?.address) {
    return IDLS_BY_PROGRAM[programId.toBase58()] || idl;
  }

  return idl;
}

const IDLS_BY_PROGRAM: Record<string, any> = {
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w": lazyDistributorIdl,
  hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR: heliumSubDaosIdl,
  credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT: dataCreditsIdl,
  hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8: heliumEntityManagerIdl,
  circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g: circuitBreakerIdl,
  treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5: treasuryManagementIdl,
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h": lazyTransactionsIdl,
  porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy: priceOracleIdl,
  rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF: rewardsOracleIdl,
  hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8: voterStakeRegistryIdl,
  fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6: fanoutIdl,
  memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr: mobileEntityManagerIdl,
  hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ: hexboostingIdl,
  noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv: noEmitIdl,
};
