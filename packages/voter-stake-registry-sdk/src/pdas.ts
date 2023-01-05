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

export const positionKey = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("position", "utf-8"),
      mint.toBuffer(),
    ],
    programId
  );

export const voterWeightRecordKey = (
  registrar: PublicKey,
  positionAuthority: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      registrar.toBuffer(),
      Buffer.from("voter-weight-record", "utf-8"),
      positionAuthority.toBuffer(),
    ],
    programId
);

export const nftVoteRecordKey = (
  proposal: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("nft-vote-record", "utf-8"),
      proposal.toBuffer(),
      mint.toBuffer(),
    ],
    programId
  );