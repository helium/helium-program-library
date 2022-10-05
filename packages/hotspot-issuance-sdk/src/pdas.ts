import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

export const hotspotConfigKey = (collection: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("hotspot_config", "utf-8"), collection.toBuffer()],
    PROGRAM_ID
  );

export const hotspotIssuerKey = (hotspotConfig: PublicKey, maker: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("hotspot_issuer", "utf-8"),
      hotspotConfig.toBuffer(),
      maker.toBuffer(),
    ],
    PROGRAM_ID
  );

export const hotspotKey = (eccCompact: string) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("hotspot", "utf-8"), Buffer.from(eccCompact, "utf-8")],
    PROGRAM_ID
  );

export const hotspotStorage = (hotspot: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("storage", "utf-8"), hotspot.toBuffer()],
    PROGRAM_ID
  );

export const collectionMetadataKey = (collection: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collection.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
