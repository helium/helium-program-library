import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";

const sanitizeValue = (value: any): any => {
  if (value === "undefined" || value === null || value === "") return null;
  if (value instanceof Buffer) return value;
  if (value.toBase58) return value.toBase58();
  if (value instanceof BN) {
    const val = value.toString();
    if (val == "") {
      return null;
    }

    return val;
  }
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
        [key]: sanitizeValue(val),
      }),
      value
    );
  }
};

export const sanitizeAccount = (acc: any) =>
  Object.entries(acc).reduce((acc, [key, value]) => {
    if (Array.isArray(value)) {
      // @ts-ignore
      acc[key] = value.map(sanitizeValue);
    } else {
      // @ts-ignore
      acc[key] = sanitizeValue(value);
    }
    return acc;
  }, {});
