/**
 * Bytes a Jito tip transfer adds to a v0 transaction in the worst case: the
 * tip account key (32, never in a lookup table), the System Program key (32,
 * when the tx does not reference it yet), the compiled instruction (17), and
 * one byte for the account-count length prefix growing past 127.
 */
export const JITO_TIP_RESERVE_BYTES = 82;
