import * as anchor from "@anchor-lang/core";
import { SOLANA_URL } from "../env";

anchor.setProvider(anchor.AnchorProvider.local(SOLANA_URL));

export const provider = anchor.getProvider() as anchor.AnchorProvider;
