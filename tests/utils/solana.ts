import { Provider } from "@coral-xyz/anchor";
import { SYSVAR_CLOCK_PUBKEY, Keypair, Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";

export async function getUnixTimestamp(provider: Provider): Promise<bigint> {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}

export function loadKeypair(keypair: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}

export async function exists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}