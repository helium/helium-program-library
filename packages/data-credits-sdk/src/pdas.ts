import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function dataCreditsKey(programId=PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("dc", "utf-8"),
    ],
    programId
  );
}

export function tokenAuthorityKey(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("dc_token_auth", "utf-8"),
    ],
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