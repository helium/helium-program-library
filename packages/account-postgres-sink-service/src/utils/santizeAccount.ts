import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";

const santizeValue = (value: any) => {
  if (value instanceof PublicKey) return value.toBase58();
  if (value instanceof BN) return value.toNumber();
  if (typeof value === "number") return value;
};

export const sanitizeAccount = (acc: any) =>
  Object.entries(acc).reduce((acc, [key, value]) => {
    if (Array.isArray(value)) {
      acc[key] = value.map(santizeValue);
    } else {
      acc[key] = santizeValue(value);
    }
    return acc;
  }, {});
