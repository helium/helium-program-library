import { BN } from "bn.js";

export * from "./init";

export function delegatorRewardsPercent(percent: number) {
  return new BN(Math.floor(percent * Math.pow(10, 8)));
}

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

