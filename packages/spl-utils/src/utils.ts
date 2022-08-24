import BN from "bn.js";
import { Mint } from "@solana/spl-token";

export type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

export const truthy = <T>(value: T): value is Truthy<T> => !!value;

export function toNumber(numberOrBn: BN | number, mint: Mint): number {
  if (BN.isBN(numberOrBn)) {
    return amountAsNum(numberOrBn, mint);
  } else {
    return numberOrBn;
  }
}

export function amountAsNum(amount: BN, mint: Mint): number {
  const decimals = new BN(Math.pow(10, mint.decimals).toString());
  const decimal = amount.mod(decimals).toNumber() / decimals.toNumber();
  return amount.div(decimals).toNumber() + decimal;
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
