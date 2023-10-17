import {
  currentEpoch,
  daoEpochInfoKey,
  daoKey,
  EPOCH_LENGTH,
  init as initDao,
  subDaoEpochInfoKey,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import * as anchor from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  ConfirmedSignatureInfo,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { BN } from "bn.js";
import b58 from "bs58";
import os from "os";
import yargs from "yargs/yargs";
import { IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { init } from "@helium/voter-stake-registry-sdk";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const voterStakeRegistryProgram = await init(provider);
  const markers = await voterStakeRegistryProgram.account.voteMarkerV0.all();

  console.log(`${markers.length} total`)
  let i = 0;
  for (const marker of markers) {
    i++
    await voterStakeRegistryProgram.methods
      .repairVoteMarkerSizes()
      .accounts({
        marker: marker.publicKey,
        voter: marker.account.voter,
        payer: provider.wallet.publicKey,
      })
      .rpc({ skipPreflight: true });
    console.log(`Closed ${i}/${markers.length}`);
  }
  console.log("Done")
}
