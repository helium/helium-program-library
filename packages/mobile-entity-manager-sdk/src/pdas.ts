import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { sha256 } from "js-sha256";
// @ts-ignore
import bs58 from "bs58";

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

export const incentiveProgramKey = (
  carrier: PublicKey,
  name: string,
  programId: PublicKey = PROGRAM_ID
) => {
  const hash = sha256(name);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("incentive_escrow_program", "utf-8"),
      carrier.toBuffer(),
      Buffer.from(hash, "hex"),
    ],
    programId
  );
};
