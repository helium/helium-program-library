import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function fanoutKey(
  name: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout", "utf-8"), Buffer.from(name, "utf-8")],
    programId
  );
}

export function membershipVoucherKey(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout_voucher", "utf-8"), mint.toBuffer()],
    programId
  );
}

export function membershipCollectionKey(
  fanout: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf-8"), fanout.toBuffer()],
    programId
  );
}
