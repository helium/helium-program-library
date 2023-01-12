import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import crypto from "crypto";

export const rewardableEntityConfigKey = (
  subDao: PublicKey,
  symbol: string,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("rewardable_entity_config", "utf-8"),
      subDao.toBuffer(),
      Buffer.from(symbol, "utf-8"),
    ],
    programId
  );

export const hotspotCollectionKey = (
  maker: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf-8"), maker.toBuffer()],
    programId
  );

export const makerKey = (
  name: String,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("maker", "utf-8"),
      Buffer.from(name, "utf-8"),
    ],
    programId
  );

export const keyToAssetKey = async (
  entityKey: Buffer,
  programId: PublicKey = PROGRAM_ID
) => {
  const hash = await crypto.subtle.digest("SHA-256", entityKey);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("key_to_asset", "utf-8"), Buffer.from(hash)],
    programId
  );
}

export const iotInfoKey = (
  rewardableEntityConfig: PublicKey,
  assetId: PublicKey,
  programId: PublicKey = PROGRAM_ID
) => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("iot_info", "utf-8"), rewardableEntityConfig.toBuffer(), assetId.toBuffer()],
    programId
  );
};

export const mobileInfoKey = (
  rewardableEntityConfig: PublicKey,
  assetId: PublicKey,
  programId: PublicKey = PROGRAM_ID
) => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("mobile_info", "utf-8"),
      rewardableEntityConfig.toBuffer(),
      assetId.toBuffer(),
    ],
    programId
  );
};

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
