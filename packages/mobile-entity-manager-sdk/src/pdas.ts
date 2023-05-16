import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export const carrierCollectionKey = (
  carrer: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("collection", "utf-8"), carrer.toBuffer()],
    programId
  );

export const carrierKey = (subDao: PublicKey, name: String, programId: PublicKey = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("carrier", "utf-8"), subDao.toBuffer(), Buffer.from(name, "utf-8")],
    programId
  );
