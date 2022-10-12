import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";


export function lazyDistributorKey(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lazy_distributor", "utf-8"), mint.toBuffer()],
    programId
  );
}

export function recipientKey(
  lazyDistributor: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("recipient", "utf-8"), lazyDistributor.toBuffer(), mint.toBuffer()],
    programId
  );
}
