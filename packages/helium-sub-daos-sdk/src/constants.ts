import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey(
  "hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf"
);

export const EPOCH_LENGTH = 60 * 60 * 24;

export function currentEpoch(unixTime: BN): BN {
  return new BN(Math.floor(unixTime.toNumber() / EPOCH_LENGTH));
}