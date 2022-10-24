import {
  SYSVAR_CLOCK_PUBKEY
} from "@solana/web3.js";
import { provider } from "../solana";
import * as anchor from "@project-serum/anchor";
import BN from "bn.js";

export async function getUnixTimestamp(): Promise<bigint> {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock.data.readBigInt64LE(8 * 4);
  return unixTime;
}

const MAX_U64 = new anchor.BN("18446744073709551615");
export function toPercent(percentBn: anchor.BN, precision: number): number {
  const precisNumber = Math.pow(10, precision);
  return (
    percentBn.mul(new BN(precisNumber)).div(MAX_U64).toNumber() / precisNumber
  );
}