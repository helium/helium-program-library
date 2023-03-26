import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function fanoutKey(
  fanout: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout", "utf-8"), fanout.toBuffer()],
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
