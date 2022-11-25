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

export function compressedRecipientKey(
  lazyDistributor: PublicKey,
  merkleTree: PublicKey,
  index: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const indexBuf = Buffer.alloc(4);
  indexBuf.writeInt32LE(index);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("recipient", "utf-8"),
      lazyDistributor.toBuffer(),
      merkleTree.toBuffer(),
      indexBuf
    ],
    programId
  );
}
