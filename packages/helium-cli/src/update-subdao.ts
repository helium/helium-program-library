import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrCreateProposal } from "./utils";
import { parseEmissionsSchedule } from "./utils";

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
  dntMint: {
    required: true,
    type: "string",
    describe: "DNT mint of the subdao to be updated",
  },
  newAuthority: {
    required: false,
    describe: "New subdao authority",
    type: "string",
    default: null,
  },
  newEmissionsSchedulePath: {
    required: false,
    describe: "Path to file that contains the new emissions schedule",
    type: "string",
    default: null,
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
  const wallet = loadKeypair(argv.wallet);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKey = new PublicKey(argv.councilKey);
  const program = await initHsd(provider);

  const instructions = [];
  instructions.push(await program.methods.updateSubDaoV0({
    authority: new PublicKey(argv.newAuthority),
    emissionSchedule: argv.newEmissionsSchedulePath ? parseEmissionsSchedule(argv.newEmissionsSchedulePath) : null,
    dcBurnAuthority: null,
    onboardingDcFee: null,
  }).accounts({
    subDao: subDaoKey(new PublicKey(argv.dntMint))[0],
  }).instruction());

  await sendInstructionsOrCreateProposal({
    provider,
    instructions,
    walletSigner: wallet,
    govProgramId,
    proposalName: "Update Subdao",
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
