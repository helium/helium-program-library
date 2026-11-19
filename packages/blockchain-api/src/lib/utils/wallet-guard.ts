/**
 * Room left under the packet limit for the guard instructions a wallet appends
 * to a transaction it signs as fee payer: Phantom and Solflare add Lighthouse
 * assertions, each with the Lighthouse program's key and its own data. An
 * estimate, not a measurement: a wallet that adds more than this to a
 * transaction near the limit can still push it past the packet limit.
 */
export const WALLET_GUARD_RESERVE_BYTES = 100;
