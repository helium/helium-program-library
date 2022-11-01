import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function subDaoEpochInfoKey(
  subDao: PublicKey,
  unixTime: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  let bU64 = Buffer.alloc(8);
  const epoch = Math.floor(unixTime / (24 * 60 * 60));
  bU64.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sub_dao_epoch_info", "utf-8"), subDao.toBuffer(), bU64],
    programId
  );
}


export function daoKey(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dao", "utf-8"), mint.toBuffer()],
    programId
  );
}

export function subDaoKey(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sub_dao", "utf-8"), mint.toBuffer()],
    programId
  );
}
