import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8"
);

/**
 * Space `issue_data_only_entity_v0` allocates for a KeyToAssetV0:
 * `8 + std::mem::size_of::<KeyToAssetV0>() + 1 + entity_key.len()` (see
 * programs/helium-entity-manager/src/instructions/issue_data_only_entity_v0.rs;
 * the struct in programs/helium-entity-manager/src/state.rs lays out to 96
 * bytes, its Vec forcing 8-byte alignment). Price it with
 * connection.getMinimumBalanceForRentExemption so callers follow the
 * cluster's Rent sysvar.
 */
export const keyToAssetSpace = (entityKeyLen: number) =>
  8 + 96 + 1 + entityKeyLen;

/** `IOT_HOTSPOT_INFO_SIZE` in programs/helium-entity-manager/src/state.rs. */
export const IOT_HOTSPOT_INFO_SPACE = 132;

/** `MOBILE_HOTSPOT_INFO_SIZE` in programs/helium-entity-manager/src/state.rs. */
export const MOBILE_HOTSPOT_INFO_SPACE = 208;
