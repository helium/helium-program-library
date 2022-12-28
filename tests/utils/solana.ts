import { Provider } from "@project-serum/anchor";
import { SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";

export async function getUnixTimestamp(provider: Provider): Promise<bigint> {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}
