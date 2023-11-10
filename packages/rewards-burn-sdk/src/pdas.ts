import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function burnKey(programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("burn", "utf-8")],
    programId
  );
}
