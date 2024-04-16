import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import BN from "bn.js";

export function boostedHexKey(
  boostConfig: PublicKey,
  carrier: PublicKey,
  location: BN,
  programId: PublicKey = PROGRAM_ID
) {
  const locBuffer = Buffer.alloc(8);
  locBuffer.writeBigUint64LE(BigInt(location.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("boosted_hex", "utf-8"), boostConfig.toBuffer(), carrier.toBuffer(), locBuffer],
    programId
  );
}

export function boostConfigKey(
  paymentMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("boost_config", "utf-8"), paymentMint.toBuffer()],
    programId
  );
}
