import BN from "bn.js";
import { Mint } from "@solana/spl-token";

export type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

export const truthy = <T>(value: T): value is Truthy<T> => !!value;

export function toNumber(numberOrBn: BN | number, mintOrDecimals: Mint | number): number {
  if (BN.isBN(numberOrBn)) {
    return amountAsNum(numberOrBn, mintOrDecimals);
  } else {
    return numberOrBn;
  }
}

export function amountAsNum(amount: BN, mintOrDecimals: Mint | number): number {
  const decimals: number =
    typeof mintOrDecimals === "number"
      ? mintOrDecimals
      : (mintOrDecimals as Mint).decimals;
  const factor = new BN(Math.pow(10, decimals).toString());
  const decimal = amount.mod(factor).toNumber() / factor.toNumber();
  return amount.div(factor).toNumber() + decimal;
}

export function toBN(
  numberOrBn: BN | number,
  mintOrDecimals: Mint | number
): BN {
  const decimals: number =
    typeof mintOrDecimals === "number"
      ? mintOrDecimals
      : (mintOrDecimals as Mint).decimals;

  if (BN.isBN(numberOrBn)) {
    return numberOrBn;
  } else {
    return new BN(
      Math.ceil(Number(numberOrBn) * Math.pow(10, decimals)).toLocaleString(
        "fullwide",
        { useGrouping: false }
      )
    );
  }
}

export function supplyAsNum(mint: Mint): number {
  return amountAsNum(new BN(mint.supply.toString()), mint);
}

export function numberWithCommas(x: number, decimals: number = 4): string {
  return roundToDecimals(x, decimals).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

export function roundToDecimals(num: number, decimals: number): number {
  return Math.trunc(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}


export function humanReadable(bn: BN, mint: Mint): string {
  return numberWithCommas(
    roundToDecimals(toNumber(bn, mint), mint.decimals)
  );
}
