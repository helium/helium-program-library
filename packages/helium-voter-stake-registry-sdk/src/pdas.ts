import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export const registrarKey = (
  realm: PublicKey,
  realmGoverningMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      realm.toBuffer(),
      Buffer.from("registrar", "utf-8"),
      realmGoverningMint.toBuffer(),
    ],
    programId
  );

export const voterKey = (
  registrar: PublicKey,
  voterAuthority: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      registrar.toBuffer(),
      Buffer.from("voter", "utf-8"),
      voterAuthority.toBuffer(),
    ],
    programId
  );

export const voterWeightRecordKey = (
  registrar: PublicKey,
  voterAuthority: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      registrar.toBuffer(),
      Buffer.from("voter-weight-record", "utf-8"),
      voterAuthority.toBuffer(),
    ],
    programId
  );
