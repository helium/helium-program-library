import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function dataCreditsKey(programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dc", "utf-8")],
    programId
  );
}
