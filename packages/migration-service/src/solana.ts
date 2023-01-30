import { AccountFetchCache } from "@helium/spl-utils";
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import fs from "fs";
import { SOLANA_URL } from "./env";

process.env.ANCHOR_PROVIDER_URL = SOLANA_URL;
anchor.setProvider(anchor.AnchorProvider.local(SOLANA_URL));

export const provider = anchor.getProvider() as anchor.AnchorProvider;
export const cache = new AccountFetchCache({
  connection: provider.connection,
  commitment: "confirmed",
  extendConnection: true,
});

export const wallet: Keypair = loadKeypair(process.env.ANCHOR_WALLET);

export function loadKeypair(keypair: string): Keypair {
  console.log(process.env.ANCHOR_PROVIDER_URL);
  anchor.setProvider(anchor.AnchorProvider.env());

  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}
