import { HNT_MINT, IOT_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { daoKey } from "@helium/helium-sub-daos-sdk";

export const HNT = process.env.HNT_MINT
  ? new PublicKey(process.env.HNT_MINT)
  : HNT_MINT;
export const DNT = process.env.DNT_MINT
  ? new PublicKey(process.env.DNT_MINT)
  : IOT_MINT;
export const DAO = daoKey(HNT)[0];

export const MAX_CLAIMS_PER_TX = process.env.MAX_CLAIMS_PER_TX
  ? parseInt(process.env.MAX_CLAIMS_PER_TX)
  : 5;

// Byte size of a RecipientV0 the claim payer must fund. Priced at request
// time with connection.getMinimumBalanceForRentExemption so the gate follows
// the cluster's Rent sysvar. resize_to_fit never refunds, so the init size
// (not the smaller resized one) is what the wallet must cover.
// programs/lazy-distributor/src/instructions/initialize_recipient_v0.rs:
//   space = 8 + 60 + size_of::<RecipientV0>() + 8 * oracles.len()
// size_of::<RecipientV0>() = 144; mainnet recipients read back at 220 bytes
// with one oracle.
export const recipientSpace = (numOracles: number) =>
  8 + 60 + 144 + 8 * numOracles;
