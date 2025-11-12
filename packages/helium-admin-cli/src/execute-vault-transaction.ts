import * as anchor from "@coral-xyz/anchor";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import os from "os";
import yargs from "yargs/yargs";

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
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
      required: true,
    },
    transactionIndex: {
      type: "number",
      describe: "Transaction index to execute",
      required: true,
    },
    batchIndex: {
      type: "number",
      describe: "Batch index to execute",
      required: true,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;

  const ix = await multisig.instructions.batchExecuteTransaction({
    multisigPda: new PublicKey(argv.multisig!),
    transactionIndex: argv.transactionIndex!,
    batchIndex: BigInt(argv.batchIndex!),
    member: provider.wallet.publicKey,
    connection,
  });

  await sendInstructionsWithPriorityFee(provider, [ix.instruction]);
}