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
