import * as anchor from "@coral-xyz/anchor";
import {
  daoKey,
  init as initDao,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import {
  getTimestampFromDays,
  getUnixTimestamp,
  loadKeypair,
  sendInstructionsOrCreateProposal,
} from "./utils";

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
      "Mint of the HNT token. Only used if --resetDaoVotingMint flag is set",
  },
  dntMint: {
    type: "string",
    describe:
      "Mint of the subdao token. Only used if --resetSubDaoVotingMint flag is set",
  },
  resetDaoVotingMint: {
    type: "boolean",
    describe: "Reset the dao voting mint",
    default: false,
  },
  resetSubDaoVotingMint: {
    type: "boolean",
    describe: "Reset the subdao voting mint",
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

const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  if (argv.resetSubDaoVotingMint && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }

  const councilKey = new PublicKey(argv.councilKey);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initDao(provider);
  const hvsrProgram = await initVsr(provider);
  const now = Number(await getUnixTimestamp(provider));
  const in7Days = now + getTimestampFromDays(7);
  const instructions = [];

  if (argv.resetDaoVotingMint) {
    console.log("resetting dao votingMint");
    const hntMint = new PublicKey(argv.hntMint);
    const dao = daoKey(hntMint)[0];
    const daoAcc = await hsdProgram.account.daoV0.fetch(dao);

    instructions.push(
      await hvsrProgram.methods
        .configureVotingMintV0({
          idx: 0,
          digitShift: 0,
          baselineVoteWeightScaledFactor: new anchor.BN(0 * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(100 * 1e9),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
          genesisVotePowerMultiplier: 3,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(in7Days),
        })
        .accounts({
          registrar: daoAcc.registrar,
          mint: hntMint,
        })
        .remainingAccounts([
          {
            pubkey: hntMint,
            isSigner: false,
            isWritable: false,
          },
        ])
        .instruction()
    );
  }

  if (argv.resetSubDaoVotingMint) {
    console.log("resetting subdao votingMint");
    const dntMint = new PublicKey(argv.dntMint);
    const subDao = subDaoKey(dntMint)[0];
    const subdaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);

    instructions.push(
      await hvsrProgram.methods
        .configureVotingMintV0({
          idx: 0,
          digitShift: -1,
          baselineVoteWeightScaledFactor: new anchor.BN(0 * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(100 * 1e9),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
          genesisVotePowerMultiplier: 1,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(now),
        })
        .accounts({
          registrar: subdaoAcc.registrar,
          mint: dntMint,
        })
        .remainingAccounts([
          {
            pubkey: dntMint,
            isSigner: false,
            isWritable: false,
          },
        ])
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
    proposalName: `Reset Voting Mint Config`,
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
