import * as anchor from "@coral-xyz/anchor";
import { SOLANA_URL } from "../env";

anchor.setProvider(anchor.AnchorProvider.local(SOLANA_URL));
export const provider = anchor.getProvider() as anchor.AnchorProvider;
