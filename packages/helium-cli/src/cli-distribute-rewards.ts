import * as client from "@helium/distributor-oracle";
import { getCurrentRewards } from "@helium/distributor-oracle";
import {
  init as initDao,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import {
  PROGRAM_ID
} from "@helium/hotspot-issuance-sdk";
import {
  init as initLazy,
  lazyDistributorKey
} from "@helium/lazy-distributor-sdk";
import { sendAndConfirmWithRetry } from "@helium/spl-utils";
import Address from "@helium/address";
import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./bootstrap";

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

  const mobileKeypair = await loadKeypair(argv.mobileKeypair);
  const mobileSubdao = (await subDaoKey(mobileKeypair.publicKey))[0];

  const hotspotEcc = "11wsqKcoXGesnSbEwKTY8QkoqdFsG7oafcyPn8jBnzRK4sfCSw8";
  const eccCompact = Address.fromB58(hotspotEcc).publicKey;

  const mobileSubdaoAcc = await heliumSubDaosProgram.account.subDaoV0.fetch(
    mobileSubdao
  );
  const [lazyDistributor] = await lazyDistributorKey(mobileSubdaoAcc.dntMint);
  const [hotspot] = await PublicKey.findProgramAddressSync(
    [Buffer.from("hotspot", "utf-8"), eccCompact],
    PROGRAM_ID
  );

  const rewards = await getCurrentRewards(
    lazyDistributorProgram,
    lazyDistributor,
    hotspot
  );
  console.log(rewards);

  const tx = await client.formTransaction({
    program: lazyDistributorProgram,
    provider,
    rewards,
    hotspot,
    lazyDistributor,
  });
  await sendAndConfirmWithRetry(
    provider.connection,
    tx.serialize(),
    { skipPreflight: true },
    "confirmed"
  );
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
