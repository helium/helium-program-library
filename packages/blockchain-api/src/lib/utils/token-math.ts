import BN from "bn.js";
import { HNT_MINT } from "@helium/spl-utils";
import { NATIVE_MINT } from "@solana/spl-token";
import type {
  TokenAmountInput,
  TokenAmountOutput,
} from "@helium/blockchain-api/schemas/common";
import { TOKEN_DECIMALS } from "@/lib/constants/tokens";

export const HNT_DECIMALS = 8;
const HNT_DIVISOR = new BN(10).pow(new BN(HNT_DECIMALS));
const SOL_DECIMALS = 9;

const KNOWN_DECIMALS: Record<string, number> = {
  [HNT_MINT.toBase58()]: HNT_DECIMALS,
  [NATIVE_MINT.toBase58()]: SOL_DECIMALS,
  ...TOKEN_DECIMALS,
};

export function bnToHnt(value: BN): number {
  const integerPart = value.div(HNT_DIVISOR);
  const fractionalPart = value.mod(HNT_DIVISOR);
  return (
    integerPart.toNumber() + fractionalPart.toNumber() / 10 ** HNT_DECIMALS
  );
}

export function hntToBonesBN(hnt: number): BN {
  return new BN(Math.round(hnt * 10 ** HNT_DECIMALS));
}

export function solToLamportsBN(sol: number): BN {
  return new BN(Math.round(sol * 10 ** SOL_DECIMALS));
}

export function resolveTokenAmountInput(
  input: TokenAmountInput,
  expectedMint?: string,
): BN {
  if (expectedMint && input.mint !== expectedMint) {
    throw new Error(
      `Mint mismatch: expected ${expectedMint}, got ${input.mint}`,
    );
  }
  const decimals = KNOWN_DECIMALS[input.mint];
  if (decimals === undefined) {
    throw new Error(`Unknown mint: ${input.mint}`);
  }
  return new BN(input.amount);
}

function formatTokenAmount(raw: string, decimals: number): string {
  const isNegative = raw.startsWith("-");
  const abs = isNegative ? raw.slice(1) : raw;
  const padded = abs.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  const trimmed = fracPart.replace(/0+$/, "");
  const result = trimmed ? `${intPart}.${trimmed}` : intPart;
  return isNegative ? `-${result}` : result;
}

export function toTokenAmountOutput(
  rawAmount: BN,
  mint: string,
): TokenAmountOutput {
  const decimals = KNOWN_DECIMALS[mint];
  if (decimals === undefined) {
    throw new Error(`Unknown mint: ${mint}`);
  }

  const amount = rawAmount.toString();

  const uiAmount =
    rawAmount.bitLength() <= 53 ? rawAmount.toNumber() / 10 ** decimals : null;

  const uiAmountString = formatTokenAmount(amount, decimals);

  return { amount, decimals, uiAmount, uiAmountString, mint };
}
