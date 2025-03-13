import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "./constants";
import { currentEpoch } from "./utils";

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

export function daoEpochInfoKey(
  dao: PublicKey,
  unixTime: number | BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  let bU64 = Buffer.alloc(8);
  const epoch = currentEpoch(new BN(unixTime)).toNumber();
  bU64.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dao_epoch_info", "utf-8"), dao.toBuffer(), bU64],
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

export function delegatedPositionKey(
  position: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegated_position", "utf-8"), position.toBuffer()],
    programId
  );
}

const CLOCKWORK_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);
export function threadKey(
  authority: PublicKey,
  threadId: "calculate" | "issue" | "issue_hst",
  programId: PublicKey = CLOCKWORK_PID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("thread", "utf8"),
      authority.toBuffer(),
      Buffer.from(threadId, "utf8"),
    ],
    programId
  );
}
