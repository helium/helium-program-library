import { AccountFetchCache } from "@helium/account-fetch-cache";
import * as anchor from "@coral-xyz/anchor";
import { SOLANA_URL } from "./env";
import { init } from "@helium/voter-stake-registry-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { Keypair, PublicKey } from "@solana/web3.js";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import fs from "fs";
import { Program } from "@coral-xyz/anchor";

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

// @ts-ignore
export let voterStakeRegistryProgram: Program<VoterStakeRegistry>;
// @ts-ignore
export let heliumSubDaosProgram: Program<HeliumSubDaos>;
export let tuktukProgram: any;
export let hplCronsProgram: any;

export async function getPrograms() {
  if (!voterStakeRegistryProgram) {
    voterStakeRegistryProgram = await init(provider);
  }
  if (!heliumSubDaosProgram) {
    heliumSubDaosProgram = await initHeliumSubDaos(provider);
  }
  if (!tuktukProgram) {
    tuktukProgram = await initTuktuk(provider);
  }
  if (!hplCronsProgram) {
    hplCronsProgram = await initHplCrons(provider);
  }
}

