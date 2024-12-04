import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey("pvr1pJdeAcW6tzFyPRSmkL5Xwysi1Tq79f7KF2XB4zM");
export const EPOCH_LENGTH = 60 * 60 * 24;

export function currentEpoch(unixTime: BN): BN {
  return new BN(Math.floor(unixTime.toNumber() / EPOCH_LENGTH));
}