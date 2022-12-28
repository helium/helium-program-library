import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { currentEpoch, PROGRAM_ID } from "./constants";

export function subDaoEpochInfoKey(
  subDao: PublicKey,
  unixTime: number | BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  let bU64 = Buffer.alloc(8);
  const epoch = currentEpoch(new BN(unixTime)).toNumber();
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

export function stakePositionKey(
  position: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([
    Buffer.from("stake_position", "utf-8"), position.toBuffer()], 
    programId
  );
}
