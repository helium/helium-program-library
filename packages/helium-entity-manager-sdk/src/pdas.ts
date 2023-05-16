import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { PROGRAM_ID } from "./constants";
// @ts-ignore
import bs58 from "bs58";

export const entityCreatorKey = (
  dao: PublicKey,
  programId: PublicKey = PROGRAM_ID
) => 
  PublicKey.findProgramAddressSync([Buffer.from("entity_creator", "utf-8"), dao.toBuffer()], programId);

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

export const makerKey = (dao: PublicKey, name: String, programId: PublicKey = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("maker", "utf-8"), dao.toBuffer(), Buffer.from(name, "utf-8")],
    programId
  );

export const programApprovalKey = (
  dao: PublicKey,
  program: PublicKey,
  thisProgramId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("program_approval", "utf-8"),
      dao.toBuffer(),
      program.toBuffer(),
    ],
    thisProgramId
  );

export const makerApprovalKey = (
  rewardableEntityConfig: PublicKey,
  maker: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("maker_approval", "utf-8"),
      rewardableEntityConfig.toBuffer(),
      maker.toBuffer(),
    ],
    programId
  );

export const keyToAssetKey = (
  dao: PublicKey,
  entityKey: Buffer | string,
  programId: PublicKey = PROGRAM_ID
) => {
  if (typeof entityKey === "string") {
    entityKey = Buffer.from(bs58.decode(entityKey));
  }
  const hash = sha256(entityKey);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("key_to_asset", "utf-8"), dao.toBuffer(), Buffer.from(hash, "hex")],
    programId
  );
};

export const iotInfoKey = (
  rewardableEntityConfig: PublicKey,
  entityKey: Buffer | string,
  programId: PublicKey = PROGRAM_ID
) => {
  if (typeof entityKey === "string") {
    entityKey = Buffer.from(bs58.decode(entityKey));
  }
  const hash = sha256(entityKey);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("iot_info", "utf-8"),
      rewardableEntityConfig.toBuffer(),
      Buffer.from(hash, "hex"),
    ],
    programId
  );
};

export const mobileInfoKey = (
  rewardableEntityConfig: PublicKey,
  entityKey: Buffer | string,
  programId: PublicKey = PROGRAM_ID
) => {
  if (typeof entityKey === "string") {
    entityKey = Buffer.from(bs58.decode(entityKey));
  }
  const hash = sha256(entityKey);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("mobile_info", "utf-8"),
      rewardableEntityConfig.toBuffer(),
      Buffer.from(hash, "hex"),
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
