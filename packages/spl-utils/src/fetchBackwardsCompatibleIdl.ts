import { Provider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { IDL as CB_IDL } from "@helium/idls/lib/esm/circuit_breaker";
import { IDL as HSD_IDL } from "@helium/idls/lib/esm/helium_sub_daos";
import { IDL as DC_IDL } from "@helium/idls/lib/esm/data_credits";
import { IDL as HEM_IDL } from "@helium/idls/lib/esm/helium_entity_manager";
import { IDL as TM_IDL } from "@helium/idls/lib/esm/treasury_management";
import { IDL as LT_IDL } from "@helium/idls/lib/esm/lazy_transactions";
import { IDL as PO_IDL } from "@helium/idls/lib/esm/price_oracle";
import { IDL as RO_IDL } from "@helium/idls/lib/esm/rewards_oracle";
import { IDL as VSR_IDL } from "@helium/idls/lib/esm/voter_stake_registry";
import { IDL as FO_IDL } from "@helium/idls/lib/esm/fanout";
import { IDL as MEM_IDL } from "@helium/idls/lib/esm/mobile_entity_manager";
import { IDL as HB_IDL } from "@helium/idls/lib/esm/hexboosting";
import { IDL as NE_IDL } from "@helium/idls/lib/esm/no_emit";

export async function fetchBackwardsCompatibleIdl(
  programId: PublicKey,
  provider: Provider
) {
  const idl = await Program.fetchIdl(programId, provider);
  // This is an Anchor 0.30+ IDL. Return the old IDLs
  // @ts-ignore
  if (!idl || idl?.address) {
    return IDLS_BY_PROGRAM[programId.toBase58()] || idl;
  }

  return idl;
}

const IDLS_BY_PROGRAM: Record<string, any> = {
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR": HSD_IDL,
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT": DC_IDL,
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8": HEM_IDL,
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g": CB_IDL,
  "treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5": TM_IDL,
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h": LT_IDL,
  "porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy": PO_IDL,
  "rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF": RO_IDL,
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8": VSR_IDL,
  "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6": FO_IDL,
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr": MEM_IDL,
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ": HB_IDL,
  "noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv": NE_IDL,
};
