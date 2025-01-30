import * as anchor from "@coral-xyz/anchor";
import { batchInstructionsToTxsWithPriorityFee, batchParallelInstructionsWithPriorityFee, bulkSendTransactions } from "@helium/spl-utils";
import {
  init as initVsr,
} from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

const MOBILE_REGISTRAR = new PublicKey(
  "C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW"
);
const IOT_REGISTRAR = new PublicKey(
  "7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL"
);

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
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const vsrProgram = await initVsr(provider);
  const positions = await vsrProgram.account.positionV0.all();
  const registrars = new Set([MOBILE_REGISTRAR, IOT_REGISTRAR].map((p) => p.toBase58()));
  const validPositions = positions.filter(
    (p) =>
      registrars.has(p.account.registrar.toBase58()) &&
      (!p.account.lockup.endTs.eq(new BN(1738195200)) ||
        !!p.account.lockup.kind.constant)
  );
  console.log(`Updating ${validPositions.length} positions`);
  const instructions = await Promise.all(validPositions.map((p) => {
    return vsrProgram.methods.tempReleasePositionV0().accountsStrict({
      position: p.publicKey,
      authority: wallet.publicKey,
    }).instruction();
  }));

  console.log(`Constructing ${instructions.length} instructions`);
  const transactions = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
    }
  );
  console.log(`Sending ${transactions.length} transactions`);

  await bulkSendTransactions(
    provider,
    transactions,
    console.log,
    10,
    [],
    100
  );
}
