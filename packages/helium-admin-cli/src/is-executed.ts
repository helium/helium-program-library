import * as anchor from "@coral-xyz/anchor";
import {
  init as initLazy,
  isExecuted,
  lazyTransactionsKey
} from "@helium/lazy-transactions-sdk";
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
    name: {
      default: "nJWGUMOK",
      describe: "The lazy transactions instance name",
    },
    index: {
      type: "number",
      required: true
    }
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyProgram = await initLazy(provider);
  const ltKey = lazyTransactionsKey(argv.name)[0];
  const lt = await lazyProgram.account.lazyTransactionsV0.fetch(ltKey);
  const executedTransactionsKey = lt.executedTransactions;
  const executed = (
    await provider.connection.getAccountInfo(executedTransactionsKey)
  )?.data.subarray(1)!;
  const hasRun = isExecuted(executed, argv.index);

  console.log("Executed: ", hasRun);
}
