import * as anchor from "@coral-xyz/anchor";
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
    describe: "Mint of the HNT token.",
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
  const govProgramId = new PublicKey(argv.govProgramId);

  const hntMint = new PublicKey(argv.hntMint);
  const councilKey = new PublicKey(argv.councilKey);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hvsrProgram = await initVsr(provider);
  const instructions = [];

  console.log("reseeting registrar voting mints");
  const registrarAccs = await hvsrProgram.account.registrar.all();
  const now = Number(await getUnixTimestamp(provider));
  const in7Days = now + getTimestampFromDays(7);

  instructions.push(
    ...(await Promise.all(
      registrarAccs.map((registrarAcc) => {
        const isSubDao =
          !registrarAcc.account.realmGoverningTokenMint.equals(hntMint);

        return hvsrProgram.methods
          .configureVotingMintV0({
            idx: 0,
            digitShift: isSubDao ? -1 : 0,
            baselineVoteWeightScaledFactor: new anchor.BN(0 * 1e9),
            maxExtraLockupVoteWeightScaledFactor: new anchor.BN(100 * 1e9),
            lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
            genesisVotePowerMultiplier: isSubDao ? 0 : 3,
            genesisVotePowerMultiplierExpirationTs: new anchor.BN(
              isSubDao ? now : in7Days
            ),
          })
          .accounts({
            registrar: registrarAcc.publicKey,
            mint: registrarAcc.account.mint,
          })
          .remainingAccounts([
            {
              pubkey: registrarAcc.account.mint,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction();
      })
    ))
  );

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
