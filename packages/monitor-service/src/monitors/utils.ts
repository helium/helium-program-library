import {
  SYSVAR_CLOCK_PUBKEY
} from "@solana/web3.js";
import { provider } from "../solana";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";

let lastDriftCalc = 0;
let driftFromSol = BigInt(0);
export async function getUnixTimestamp(): Promise<bigint> {
  const localTime = new Date().valueOf();
  // Every hour, recheck the drift between hour clock and sol's clock
  if (localTime - lastDriftCalc > 60 * 60 * 1000) {
    lastDriftCalc = localTime;
    const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const unixTime = clock!.data.readBigInt64LE(8 * 4);

    driftFromSol = BigInt(localTime / 1000) - unixTime;
  }
  return BigInt(localTime / 1000) - driftFromSol;
}

const MAX_U64 = new anchor.BN("18446744073709551615");
export function toPercent(percentBn: anchor.BN, precision: number): number {
  const precisNumber = Math.pow(10, precision);
  return (
    percentBn.mul(new BN(precisNumber)).div(MAX_U64).toNumber() / precisNumber
  );
}