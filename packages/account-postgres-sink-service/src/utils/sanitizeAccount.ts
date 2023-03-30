import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";

const santizeValue = (value: any): any => {
  if (value === "undefined" || value === null || value === "") return null;
  if (value instanceof PublicKey) return value.toBase58();
  if (value instanceof BN) return value.toString();
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "object") {
    if (
      Object.keys(value).length === 1 &&
      JSON.stringify(value[Object.keys(value)[0]]) === "{}"
    ) {
      // enum just return the key
      return Object.keys(value)[0];
    }

    return Object.entries(value).reduce(
      (acc, [key, val]) => ({
        ...acc,
        [key]: santizeValue(val),
      }),
      value
    );
  }
};

export const sanitizeAccount = (acc: any) =>
  Object.entries(acc).reduce((acc, [key, value]) => {
    if (Array.isArray(value)) {
      // @ts-ignore
      acc[key] = value.map(santizeValue);
    } else {
      // @ts-ignore
      acc[key] = santizeValue(value);
    }
    return acc;
  }, {});
