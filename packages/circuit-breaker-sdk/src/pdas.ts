import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function mintWindowedBreakerKey(mint: PublicKey, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("mint_windowed_breaker", "utf-8"),
      mint.toBuffer()
    ],
    programId
  );
}

export function accountWindowedBreakerKey(
  account: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("account_windowed_breaker", "utf-8"), account.toBuffer()],
    programId
  );
}

