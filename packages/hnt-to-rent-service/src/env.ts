import os from 'os';

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + '/.config/solana/id.json';

export const SOLANA_URL = process.env.SOLANA_URL || 'http://127.0.0.1:8899';
export const JUPITER_URL =
  process.env.JUPITER_URL || 'https://quote-api.jup.ag/v6';
export const JUPITER_FEE_BPS = process.env.JUPITER_FEE_BPS || '0';
export const JUPITER_FEE_ACCOUNT = process.env.JUPITER_FEE_ACCOUNT || undefined;
