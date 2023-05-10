import os from 'os';

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET ||
  os.homedir() + '/.config/solana/id.json';

export const SOLANA_URL =
  process.env.SOLANA_URL || 'http://127.0.0.1:8899';

export const PROGRAM_ACCOUNT_CONFIGS =
  process.env.PROGRAM_ACCOUNT_CONFIGS ||
  `${__dirname}/../program_account_configs_example.json`;

export const GLOBAL_CRON_CONFIG =
  process.env.GLOBAL_CRON_CONFIG || '0 1 * * *'; // at 1am

export const DEFAULT_CHUNK_SIZE = process.env.DEFAULT_CHUNK_SIZE
  ? Number(process.env.DEFAULT_CHUNK_SIZE)
  : 50000;

export const DEFAULT_WRITE_DELAY = process.env.DEFAULT_WRITE_DELAY
  ? Number(process.env.DEFAULT_WRITE_DELAY)
  : 2000;
