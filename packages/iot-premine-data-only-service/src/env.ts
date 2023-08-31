import os from 'os';

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + '/.config/solana/id.json';

export const SOLANA_URL = process.env.SOLANA_URL || 'http://127.0.0.1:8899';

export const LAZY_TRANSACTIONS_NAME =
  process.env.NAME || 'helium-data-only-iot';

export const AWS_REGION = process.env.AWS_REGION || '';
export const PGPASSWORD = process.env.PGPASSWORD || '';
export const PGUSER = process.env.PGUSER || 'postgres';
export const PGHOST = process.env.PGHOST || 'localhost';
export const PGDATABASE = process.env.PGDATABASE || 'postgres';
export const PGPORT = Number(process.env.PGPORT) || 5432;
