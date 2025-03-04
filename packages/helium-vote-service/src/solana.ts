import { AccountFetchCache } from "@helium/account-fetch-cache";
import * as anchor from "@coral-xyz/anchor";
import { SOLANA_URL } from "./env";
import { init } from "@helium/voter-stake-registry-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { Keypair } from "@solana/web3.js";
import fs from "fs";

anchor.setProvider(anchor.AnchorProvider.local(SOLANA_URL));

export const provider = anchor.getProvider() as anchor.AnchorProvider;
export const cache = new AccountFetchCache({
  connection: provider.connection,
  commitment: "confirmed",
  extendConnection: true,
});
export const keypair = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs
        .readFileSync(
          process.env.ANCHOR_WALLET!
        )
        .toString()
    )
  )
);

export let voterStakeRegistryProgram: Program<VoterStakeRegistry>;
export let tuktukProgram: any;
export async function getPrograms() {
  if (!voterStakeRegistryProgram) {
    voterStakeRegistryProgram = await init(provider);
  }
  if (!tuktukProgram) {
    tuktukProgram = await initTuktuk(provider);
  }
}

