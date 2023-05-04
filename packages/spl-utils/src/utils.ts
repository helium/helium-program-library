import BN from "bn.js";
import { Mint } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import Address, { KeyTypes, NetTypes } from "@helium/address";

export type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

export const truthy = <T>(value: T): value is Truthy<T> => !!value;

export function toNumber(
  numberOrBn: bigint | BN | number,
  mintOrDecimals: Mint | number
): number {
  if (BN.isBN(numberOrBn) || typeof numberOrBn == "bigint") {
    return amountAsNum(numberOrBn, mintOrDecimals);
  } else {
    return numberOrBn;
  }
}

export function amountAsNum(
  amount: BN | bigint,
  mintOrDecimals: Mint | number
): number {
  const decimals: number =
    typeof mintOrDecimals === "number"
      ? mintOrDecimals
      : (mintOrDecimals as Mint).decimals;
  const factor = new BN(Math.pow(10, decimals).toString());
  const decimal =
    new BN(amount.toString()).mod(factor).toNumber() / factor.toNumber();
  return new BN(amount.toString()).div(factor).toNumber() + decimal;
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
    return new BN(Number(Math.floor(Number(numberOrBn))))
      .mul(new BN(Math.pow(10, decimals)))
      .add(
        new BN(Math.round((Number(numberOrBn) % 1) * Math.pow(10, decimals)))
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

export function humanReadableBigint(
  bigint: bigint,
  decimals: number,
  round: number = decimals
): string {
  return numberWithCommas(roundToDecimals(toNumber(bigint, decimals), round));
}

export function humanReadable(bn: BN, decimalsOrMint: Mint | number): string {
  return numberWithCommas(
    roundToDecimals(
      toNumber(bn, decimalsOrMint),
      typeof decimalsOrMint == "number"
        ? decimalsOrMint
        : decimalsOrMint.decimals
    )
  );
}

export const getSolanaKeypair = (secretKey: string) =>
  Keypair.fromSecretKey(Buffer.from(secretKey, "base64"));

export const heliumAddressToSolPublicKey = (heliumAddress: string) => {
  const heliumPK = Address.fromB58(heliumAddress).publicKey;
  return new PublicKey(heliumPK);
};

export const heliumAddressToSolAddress = (heliumAddress: string) => {
  return heliumAddressToSolPublicKey(heliumAddress).toBase58();
};

export const heliumAddressFromSolKey = (pubKey: PublicKey) => {
  return new Address(
    0,
    NetTypes.MAINNET,
    KeyTypes.ED25519_KEY_TYPE,
    pubKey.toBuffer()
  ).b58;
};

export const heliumAddressFromSolAddress = (solAddress: string) => {
  try {
    const pubKey = new PublicKey(solAddress);
    return heliumAddressFromSolKey(pubKey);
  } catch {
    return "";
  }
};
