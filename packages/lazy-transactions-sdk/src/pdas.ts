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

export function blockKey(
  lazyTransactions: PublicKey,
  index: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUint32LE(index)
  return PublicKey.findProgramAddressSync(
    [Buffer.from("block", "utf-8"), lazyTransactions.toBuffer(), indexBuffer],
    programId
  );
}