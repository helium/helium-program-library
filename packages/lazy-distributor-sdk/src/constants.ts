import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w"
);

/**
 * Space `initialize_recipient_v0` / `initialize_compression_recipient_v0`
 * allocate for a RecipientV0:
 *   space = 8 + 60 + size_of::<RecipientV0>() + 8 * oracles.len()
 * size_of::<RecipientV0>() = 144. `set_current_rewards` later shrinks it via
 * `resize_to_fit` without refunding, so the init size is what the payer funds.
 * Price it with connection.getMinimumBalanceForRentExemption so callers follow
 * the cluster's Rent sysvar. Mainnet recipients read back at 220 bytes (one
 * oracle).
 */
export const recipientSpace = (numOracles: number) =>
  8 + 60 + 144 + 8 * numOracles;
