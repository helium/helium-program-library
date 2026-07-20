import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

/**
 * Common token mint addresses on Solana mainnet
 */

export const TOKEN_MINTS = {
  // Wrapped SOL
  WSOL: "So11111111111111111111111111111111111111112",

  // Stablecoins
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",

  // Helium Network Tokens
  HNT: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  MOBILE: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
  IOT: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns",
  DC: "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm",
} as const;

export const TOKEN_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(TOKEN_MINTS).map(([name, mint]) => [mint, name]),
  ),
  [TOKEN_MINTS.WSOL]: "SOL",
};

export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKEN_MINTS.WSOL]: 9,
  [TOKEN_MINTS.USDC]: 6,
  [TOKEN_MINTS.USDT]: 6,
  [TOKEN_MINTS.HNT]: 8,
  [TOKEN_MINTS.MOBILE]: 6,
  [TOKEN_MINTS.IOT]: 6,
  [TOKEN_MINTS.DC]: 0,
};

const decimalsCache = new Map<string, number>(Object.entries(TOKEN_DECIMALS));

/**
 * Get decimals for a token mint. Returns from static map for known tokens,
 * otherwise fetches from RPC and caches the result.
 */
export async function getTokenDecimals(mint: string): Promise<number> {
  const cached = decimalsCache.get(mint);
  if (cached !== undefined) return cached;

  const { env } = await import("@/lib/env");
  const connection = new Connection(env.SOLANA_RPC_URL);
  const mintInfo = await getMint(connection, new PublicKey(mint));
  decimalsCache.set(mint, mintInfo.decimals);
  return mintInfo.decimals;
}
