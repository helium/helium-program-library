import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function lazyTransactionsKey(
  key: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lazy_transactions", "utf-8"), Buffer.from(key, "utf-8")],
    programId
  );
}

export function lazySignerKey(
  key: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lazy_signer", "utf-8"), Buffer.from(key, "utf-8")],
    programId
  );
}
