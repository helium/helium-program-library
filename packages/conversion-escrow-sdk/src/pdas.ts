import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function conversionEscrowKey(
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("conversion_escrow", "utf-8"),
      mint.toBuffer(),
      owner.toBuffer(),
    ],
    programId
  );
}
