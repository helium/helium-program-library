import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

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

export const positionCollectionKey = (
  registrar: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf-8"), registrar.toBuffer()],
    programId
  );

export const collectionMetadataKey = (
  collection: PublicKey,
  programId: PublicKey = TOKEN_METADATA_PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      programId.toBuffer(),
      collection.toBuffer(),
    ],
    programId
  );

export const positionKey = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("position", "utf-8"), mint.toBuffer()],
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
