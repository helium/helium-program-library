import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, currentEpoch } from "./constants";
import BN from "bn.js";

export const vetokenTrackerKey = (
  registrar: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("vetoken_tracker", "utf-8"), registrar.toBuffer()],
    programId
  );

export function vsrEpochInfoKey(
  vsrTracker: PublicKey,
  unixTime: number | BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  let bU64 = Buffer.alloc(8);
  const epoch = currentEpoch(new BN(unixTime)).toNumber();
  bU64.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vsr_epoch_info", "utf-8"), vsrTracker.toBuffer(), bU64],
    programId
  );
}

export function enrolledPositionKey(
  position: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("enrolled_position", "utf-8"), position.toBuffer()],
    programId
  );
}
