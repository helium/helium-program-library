import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function dataCreditsKey(dcMint: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dc", "utf-8"), dcMint.toBuffer()],
    programId
  );
}

export function accountPayerKey(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("account_payer", "utf-8")],
    programId
  )
}
