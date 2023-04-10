import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

// oracle is the EOA. oracleSigner is the proxy PDA that actually holds the oracle authority in lazy-distributor
export function oracleSignerKey(programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_signer", "utf-8")],
    programId
  );
}
