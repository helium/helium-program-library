import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export const treasuryManagementKey = (
  supplyMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_management", "utf-8"), supplyMint.toBuffer()],
    programId
  );
