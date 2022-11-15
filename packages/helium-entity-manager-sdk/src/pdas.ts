import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

export const hotspotConfigKey = (
  subDao: PublicKey,
  symbol: string,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("hotspot_config", "utf-8"),
      subDao.toBuffer(),
      Buffer.from(symbol, "utf-8"),
    ],
    programId
  );

export const hotspotCollectionKey = (
  subDao: PublicKey,
  symbol: string,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf-8"), subDao.toBuffer(), Buffer.from(symbol, "utf-8")],
    programId
  );

export const hotspotIssuerKey = (
  hotspotConfig: PublicKey,
  maker: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("hotspot_issuer", "utf-8"),
      hotspotConfig.toBuffer(),
      maker.toBuffer(),
    ],
    programId
  );

export const hotspotStorageKey = (
  eccCompact: Buffer,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("storage", "utf-8"), eccCompact],
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
