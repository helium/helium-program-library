import * as anchor from "@coral-xyz/anchor";
import { SOLANA_URL } from "../env";

console.log(process.env.ANCHOR_PROVIDER_URL);
anchor.setProvider(
  anchor.AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL || SOLANA_URL)
);
export const provider = anchor.getProvider() as anchor.AnchorProvider;
