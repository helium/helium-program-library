import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export async function subDaoEpochInfoKey(
  subDao: PublicKey,
  unixTime: number,
  programId: PublicKey = PROGRAM_ID
): Promise<[PublicKey, number]> {
  let bU64 = Buffer.alloc(8);
  const epoch = Math.floor(unixTime / (24 * 60 * 60));
  bU64.writeBigUInt64LE(BigInt(epoch));
  return await PublicKey.findProgramAddress(
    [Buffer.from("sub_dao_epoch_info", "utf-8"), subDao.toBuffer(), bU64],
    programId
  );
}


export async function daoKey(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): Promise<[PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [Buffer.from("dao", "utf-8"), mint.toBuffer()],
    programId
  );
}

export async function subDaoKey(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): Promise<[PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [Buffer.from("sub_dao", "utf-8"), mint.toBuffer()],
    programId
  );
}
