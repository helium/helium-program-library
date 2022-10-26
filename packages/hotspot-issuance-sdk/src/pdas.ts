import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

export const hotspotConfigKey = (
  collection: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("hotspot_config", "utf-8"), collection.toBuffer()],
    programId
  );

export const hotspotCollectionKey = (
  symbol: string,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddress(
    [Buffer.from("collection", "utf-8"), Buffer.from(symbol, "utf-8")],
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

export const hotspotKey = (
  eccCompact: string,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("hotspot", "utf-8"), Buffer.from(eccCompact, "utf-8")],
    programId
  );

export const hotspotStorageKey = (
  hotspot: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("storage", "utf-8"), hotspot.toBuffer()],
    programId
  );

export const collectionMetadataKey = (
  collection: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collection.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
