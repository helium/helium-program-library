import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { sha256 } from "js-sha256";

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
  const hash = sha256(routerKey);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("delegated_data_credits", "utf-8"),
      subDao.toBuffer(),
      Buffer.from(hash, "hex"),
    ],
    programId
  );
};

export function escrowAccountKey(
  delegatedDataCredits: PublicKey,
  programId: PublicKey = PROGRAM_ID
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow_dc_account", "utf-8"),
      delegatedDataCredits.toBuffer(),
    ],
    programId
  );
};