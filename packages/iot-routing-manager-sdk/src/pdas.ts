import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { BN } from "@coral-xyz/anchor";

export function routingManagerKey(
  subDao: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("routing_manager", "utf-8"), subDao.toBuffer()],
    programId
  );
}

export function organizationKey(
  routingManager: PublicKey,
  oui: BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const ouiBuffer = Buffer.alloc(8);
  ouiBuffer.writeBigUint64LE(BigInt(oui.toString()));
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("organization", "utf-8"),
      routingManager.toBuffer(),
      ouiBuffer,
    ],
    programId
  );
}

export function devaddrConstraintKey(
  organization: PublicKey,
  startAddr: BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const startAddrBuffer = Buffer.alloc(8);
  startAddrBuffer.writeBigUint64LE(BigInt(startAddr.toString()));
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("devaddr_constraint", "utf-8"),
      organization.toBuffer(),
      startAddrBuffer,
    ],
    programId
  );
}

export function netIdKey(
  routingManager: PublicKey,
  id: BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const idBuffer = Buffer.alloc(4);
  idBuffer.writeUInt32LE(Number(id.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("net_id", "utf-8"), routingManager.toBuffer(), idBuffer],
    programId
  );
}

export function organizationDelegateKey(
  organization: PublicKey,
  delegate: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("organization_delegate", "utf-8"),
      organization.toBuffer(),
      delegate.toBuffer(),
    ],
    programId
  );
}
