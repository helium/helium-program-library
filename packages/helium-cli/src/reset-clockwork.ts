import {
  daoKey,
  init as initDao, subDaoKey
} from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy
} from "@helium/lazy-distributor-sdk";
import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import axios from "axios";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrCreateProposal } from "./utils";

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
  hntMint: {
    type: "string",
    describe:
      "Mint of the HNT token. Only used if --resetDaoThread flag is set",
  },
  dntMint: {
    type: "string",
    describe:
      "Mint of the subdao token. Only used if --resetSubDaoThread flag is set",
  },
  resetDaoThread: {
    type: "boolean",
    describe: "Reset the dao clockwork thread",
    default: false,
  },
  resetSubDaoThread: {
    type: "boolean",
    describe: "Reset the subdao clockwork thread",
    default: false,
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S",
  },
  councilKey: {
    type: "string",
    describe: "Key of gov council token",
    default: "counKsk72Jgf9b3aqyuQpFf12ktLdJbbuhnoSxxQoMJ",
  },
  executeProposal: {
    type: "boolean",
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const govProgramId = new PublicKey(argv.govProgramId);

  if (argv.resetSubDaoThread && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }
  const councilKey = new PublicKey(argv.councilKey);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initDao(provider);
  const instructions = [];
  if (argv.resetDaoThread) {
    console.log("resetting dao thread")
    const hntMint = new PublicKey(argv.hntMint);
    const dao = daoKey(hntMint)[0];
    const daoAcc = await hsdProgram.account.daoV0.fetch(dao);

    instructions.push(await hsdProgram.methods.resetDaoThreadV0().accounts({
      dao,
      authority: daoAcc.authority
    }).instruction());
  }

  if (argv.resetSubDaoThread) {
    console.log("resetting subdao thread");
    const dntMint = new PublicKey(argv.dntMint);
    const subDao = subDaoKey(dntMint)[0];
    const subdaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
    const authorityAcc = await provider.connection.getAccountInfo(
      subdaoAcc.authority
    );
    const isGov =
      authorityAcc != null && authorityAcc.owner.equals(govProgramId);
    const nativeTreasury = await PublicKey.findProgramAddressSync(
      [Buffer.from("native-treasury", "utf-8"), subdaoAcc.authority.toBuffer()],
      govProgramId
    )[0];
    instructions.push(
      await hsdProgram.methods
        .resetSubDaoThreadV0()
        .accounts({
          subDao,
          authority: subdaoAcc.authority,
          threadPayer: isGov ? nativeTreasury : provider.wallet.publicKey,
        })
        .instruction()
    );
  }

  const wallet = loadKeypair(argv.wallet);
  await sendInstructionsOrCreateProposal({
    provider,
    instructions,
    walletSigner: wallet,
    signers: [],
    govProgramId: new PublicKey(argv.govProgramId),
    proposalName: `Reset Thread`,
    votingMint: councilKey,
    executeProposal: argv.executeProposal,
  });
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
