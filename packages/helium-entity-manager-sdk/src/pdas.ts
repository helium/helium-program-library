import { PublicKey } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { PROGRAM_ID } from "./constants";
// @ts-ignore
import bs58 from "bs58";
import Address from "@helium/address";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

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
  makerOrDataOnly: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf-8"), makerOrDataOnly.toBuffer()],
    programId
  );

export const dataOnlyConfigKey = (dao: PublicKey, programId: PublicKey = PROGRAM_ID) => 
  PublicKey.findProgramAddressSync(
    [Buffer.from("data_only_config", "utf-8"), dao.toBuffer()],
    programId,
  );

export const dataOnlyEscrowKey = (dataOnly: PublicKey, programId: PublicKey = PROGRAM_ID) => 
  PublicKey.findProgramAddressSync(
    [Buffer.from("data_only_escrow", "utf-8"), dataOnly.toBuffer()],
    programId,
  );

export const sharedMerkleKey = (
  proofSize: number,
  programId: PublicKey = PROGRAM_ID
) => {
  const proofSizeBuffer = Buffer.alloc(1);
  proofSizeBuffer.writeUint8(proofSize);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("shared_merkle", "utf-8"), proofSizeBuffer],
    programId
  );
};

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

export function encodeEntityKey(
  entityKey: string,
  /// Object from anchor KeySerialization.
  keySerialization: any = { b58: {} }
): Buffer | undefined {
  if (typeof keySerialization.b58 != "undefined") {
    return bs58.decode(entityKey);
  }

  if (typeof keySerialization.utf8 != "undefined") {
    return Buffer.from(entityKey, "utf-8");
  }
}

export function decodeEntityKey(
  entityKey: Buffer,
  /// Object from anchor KeySerialization.
  keySerialization: any = { b58: {} }
): string | undefined {
  if (typeof keySerialization.b58 != "undefined") {
    return bs58.encode(entityKey)
  }

  if (typeof keySerialization.utf8 != "undefined") {
    return entityKey.toString("utf-8")
  }
}

export const keyToAssetKeyRaw = (
  dao: PublicKey,
  hashedEntityKey: Buffer,
  programId: PublicKey = PROGRAM_ID
) => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("key_to_asset", "utf-8"),
      dao.toBuffer(),
      hashedEntityKey,
    ],
    programId
  );
};

export const keyToAssetKey = (
  dao: PublicKey,
  entityKey: Buffer | string,
  encoding: BufferEncoding | "b58" = "b58",
  programId: PublicKey = PROGRAM_ID
) => {
  if (typeof entityKey === "string") {
    if (encoding == "b58" || Address.isValid(entityKey)) {
      entityKey = Buffer.from(bs58.decode(entityKey));
    } else {
      entityKey = Buffer.from(entityKey, encoding)
    }
  }
  const hash = sha256(entityKey);

  return keyToAssetKeyRaw(dao, Buffer.from(hash, "hex"), programId);
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
