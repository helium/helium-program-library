import {
  init as initDao, subDaoKey
} from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy, lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import axios from "axios";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./bootstrap";
import * as client from "@helium/distributor-oracle";
import Address from "@helium/address";
import { PROGRAM_ID, hotspotKey } from "@helium/helium-entity-manager-sdk";
import { sendAndConfirmWithRetry } from "@helium/spl-utils";
import { getCurrentRewards } from "@helium/distributor-oracle";

const { hideBin } = require("yargs/helpers");
const yarg = yargs(hideBin(process.argv)).options({
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
  oracleUrl: {
    alias: "o",
    default: "http://localhost:8080",
    describe: "The oracle url",
  },
  mobileKeypair: {
    type: "string",
    describe: "Keypair of the Mobile token",
    default: "./keypairs/mobile.json",
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const heliumSubDaosProgram = await initDao(provider);
  const lazyDistributorProgram = await initLazy(provider);
  const epochs = await heliumSubDaosProgram.account.subDaoEpochInfoV0.all()
  const epoch = epochs[epochs.length - 1].account.epoch

  const mobileKeypair = await loadKeypair(argv.mobileKeypair);

  const mobileSubdao = (await subDaoKey(mobileKeypair.publicKey))[0];

  await heliumSubDaosProgram.methods
    .calculateUtilityScoreV0({
      epoch,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
    ])
    .accounts({
      subDao: mobileSubdao,
    })
    .rpc({ skipPreflight: true });
  await heliumSubDaosProgram.methods
    .issueRewardsV0({
      epoch,
    })
    .accounts({
      subDao: mobileSubdao,
    })
    .rpc({ skipPreflight: true });

  await axios.post(`${argv.oracleUrl}/endepoch`)
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
