import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR"
);

export const EPOCH_LENGTH = 60 * 60 * 24;

/**
 * Space `delegate_v0` allocates for a DelegatedPositionV0:
 * `60 + 8 + std::mem::size_of::<DelegatedPositionV0>()` (see
 * programs/helium-sub-daos/src/instructions/delegation/delegate_v0.rs; the
 * struct in programs/helium-sub-daos/src/state.rs lays out to 176 bytes, its
 * u128 bitmap forcing 16-byte alignment). Anchor's IDL-derived `.size` is the
 * 158-byte borsh encoding, which under-quotes the wallet by 86 bytes. Price it
 * with connection.getMinimumBalanceForRentExemption so callers follow the
 * cluster's Rent sysvar.
 */
export const DELEGATED_POSITION_SPACE = 60 + 8 + 176;
