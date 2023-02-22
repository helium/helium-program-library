import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { init as initHem, rewardableEntityConfigKey } from "@helium/helium-entity-manager-sdk";
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
  name: {
    alias: "n",
    type: "string",
    required: false,
    describe: "The name of the entity config",
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
  newActiveDeviceAggregator: {
    required: false,
    default: null,
    type: "string",
  },
  newDcBurnAuthority: {
    required: false,
    default: null,
    type: "string",
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
  const hemProgram = await initHem(provider);

  const instructions = [];

  const subDao = subDaoKey(new PublicKey(argv.dntMint))[0];
  const subdaoAcc = await program.account.subDaoV0.fetch(subDao);
  if (argv.newAuthority) {
    if (!argv.name) {
      throw new Error("--name is required")
    }

    const config = rewardableEntityConfigKey(subDao, argv.name.toUpperCase())[0]
    instructions.push(
      await hemProgram.methods
        .updateRewardableEntityConfigV0({
          newAuthority: new PublicKey(argv.newAuthority),
          settings: null,
        })
        .accounts({
          rewardableEntityConfig: config,
          authority: subdaoAcc.authority
        })
        .instruction()
    );
  }
  instructions.push(
    await program.methods
      .updateSubDaoV0({
        authority: argv.newAuthority ? new PublicKey(argv.newAuthority) : null,
        emissionSchedule: argv.newEmissionsSchedulePath
          ? parseEmissionsSchedule(argv.newEmissionsSchedulePath)
          : null,
        dcBurnAuthority: argv.dcBurnAuthorityr
          ? new PublicKey(argv.dcBurnAuthority)
          : null,
        onboardingDcFee: null,
        activeDeviceAggregator: argv.newActiveDeviceAggregator
          ? new PublicKey(argv.newActiveDeviceAggregator)
          : null,
      })
      .accounts({
        subDao,
        authority: subdaoAcc.authority,
      })
      .instruction()
  );

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
