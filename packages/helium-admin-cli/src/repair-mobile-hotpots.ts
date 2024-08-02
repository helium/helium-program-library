import * as anchor from "@coral-xyz/anchor";
import { init as initHem } from "@helium/helium-entity-manager-sdk";
import os from "os";
import yargs from "yargs/yargs";
import fs from "fs";
import { batchInstructionsToTxsWithPriorityFee, sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

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
    badHotspotsFile: {
      type: "string",
      required: true,
    }
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);

  const badHotspots = JSON.parse(
    fs.readFileSync(argv.badHotspotsFile, "utf-8")
  );

  let instructions: TransactionInstruction[] = [];
  for (const hotspot of badHotspots) {
    instructions.push(
      await hemProgram.methods
        .tempRepairMobileHotspotInfo()
        .accounts({
          mobileInfo: new PublicKey(hotspot),
        })
        .instruction()
    );
  }

  await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
    useFirstEstimateForAll: true,
  });
}
