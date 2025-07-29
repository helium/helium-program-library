import BN from "bn.js";
import { EPOCH_LENGTH } from "./constants";

export const delegatorRewardsPercent = (percent: number) => {
  return new BN(Math.floor(percent * Math.pow(10, 8)));
};

export const currentEpoch = (unixTime: BN): BN => {
  return new BN(Math.floor(unixTime.toNumber() / EPOCH_LENGTH));
};

export const getLockupEffectiveEndTs = (lockup: {
  kind: any;
  endTs: BN;
}): BN => {
  const isConstant = (Object.keys(lockup.kind)[0] as string) === "constant";
  // max i64 for constant lockups
  return isConstant ? new BN(Number.MAX_SAFE_INTEGER - 1) : lockup.endTs;
};
