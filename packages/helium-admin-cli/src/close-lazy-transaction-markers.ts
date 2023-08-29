import * as anchor from "@coral-xyz/anchor";
import { blockKey, init as initLazy, lazyTransactionsKey } from "@helium/lazy-transactions-sdk";
import os from "os";
import yargs from "yargs/yargs";
import { bulkSendTransactions, chunks } from "@helium/spl-utils";
import { Transaction } from "@solana/web3.js";

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
      describe: "The lazy transactions instance name"
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
  
  const blocks = await lazyProgram.account.block.all();
  const blocksByKey = new Set(blocks.map((b) => b.publicKey.toString()));
  const allIndices = new Array(1 << lt.maxDepth).fill(0).map((_, i) => i);
  const blockIndices = allIndices.filter((bi) =>
    blocksByKey.has(blockKey(ltKey, bi)[0].toBase58())
  );
  if (lt.executed.length !== 1 << lt.maxDepth) {
    await lazyProgram.methods
      .reinitializeExecutedTransactionsV0()
      .accounts({
        lazyTransactions: ltKey,
      })
      .rpc({ skipPreflight: true });
  }
  const instructions = await Promise.all(
    blockIndices.map((bi) =>
      lazyProgram.methods
        .closeMarkerV0({
          index: bi,
        })
        .accounts({
          refund: provider.wallet.publicKey,
          lazyTransactions: ltKey,
          authority: provider.wallet.publicKey,
        })
        .instruction()
    )
  );

  console.log(`${blocks.length} blocks to close`);
  const txns = chunks(instructions, 10).map(chunk => {
    const tx = new Transaction({
      feePayer: provider.wallet.publicKey,
    })
    tx.add(...chunk)
    return tx
  })

  await bulkSendTransactions(provider, txns, (status) => {
    console.log(`Sending ${status.currentBatchProgress} / ${status.currentBatchSize} batch. ${status.totalProgress} / ${txns.length}`)
  })
  console.log("Done")
}
