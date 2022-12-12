import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import crypto from "crypto";

export function dataCreditsKey(dcMint: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dc", "utf-8"), dcMint.toBuffer()],
    programId
  );
}

export function accountPayerKey(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("account_payer", "utf-8")],
    programId
  )
}

export function delegatedDataCreditsKey(
  subDao: PublicKey,
  routerKey: string,
  programId: PublicKey = PROGRAM_ID
) {
  let hexString = crypto
    .createHash("sha256")
    .update(routerKey, "utf-8")
    .digest("hex");
  let seed = Uint8Array.from(Buffer.from(hexString, "hex"));

  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegated_data_credits", "utf-8"), subDao.toBuffer(), seed],
    programId
  );
};
