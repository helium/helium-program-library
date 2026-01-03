import * as anchor from "@coral-xyz/anchor";
import {
  blockKey,
  getBitmapLen,
  init as initLazy,
  lazyTransactionsKey,
} from "@helium/lazy-transactions-sdk";
import { bulkSendTransactions, chunks } from "@helium/spl-utils";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyProgram = await initLazy(provider);
  const ltKey = lazyTransactionsKey(argv.name)[0];
  const lt = await lazyProgram.account.lazyTransactionsV0.fetch(ltKey);

  if (lt.executedTransactions.equals(PublicKey.default)) {
    const executedTransactions = Keypair.generate();
    const executedTransactionsSize = 1 + getBitmapLen(lt.maxDepth);
    const executedTransactionsRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        executedTransactionsSize
      );
    await lazyProgram.methods
      .updateLazyTransactionsV0({
        root: null,
        authority: null,
      })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: executedTransactions.publicKey,
          space: executedTransactionsSize,
          lamports: executedTransactionsRent,
          programId: lazyProgram.programId,
        }),
      ])
      .accountsPartial({
        lazyTransactions: ltKey,
        executedTransactions: executedTransactions.publicKey,
        canopy: lt.canopy,
      })
      .signers([executedTransactions])
      .rpc({ skipPreflight: true });

    lt.executedTransactions = executedTransactions.publicKey;
  }
  const blocks = await lazyProgram.account.block.all();
  const blocksByKey = new Set(blocks.map((b) => b.publicKey.toString()));
  const allIndices = new Array(1 << lt.maxDepth)
    .fill(0)
    .map((_, i) => i)
    .map((bi) => ({
      index: bi,
      block: blockKey(ltKey, bi)[0],
    }));
  const blockIndices = allIndices.filter((bi) =>
    blocksByKey.has(bi.block.toBase58())
  );

  // Do in chunks so we don't create too many promises
  let instructions: TransactionInstruction[] = [];
  let i = 0;
  for (const chunk of chunks(blockIndices, 10)) {
    if (i % 1000 === 0) {
      console.log(`Forming txns ${i * 10}/${blockIndices.length}`);
    }
    i++;
    instructions.push(
      ...(await Promise.all(
        chunk.map((bi) =>
          lazyProgram.methods
            .closeMarkerV0({
              index: bi.index,
            })
            .accountsStrict({
              refund: provider.wallet.publicKey,
              lazyTransactions: ltKey,
              authority: provider.wallet.publicKey,
              block: bi.block,
              executedTransactions: lt.executedTransactions,
            })
            .instruction()
        )
      ))
    );
  }

  console.log(`${blocks.length} blocks to close`);
  const txns = await Promise.all(
    chunks(instructions, 10).map(async (chunk) => {
      return {
        instructions: chunk,
        feePayer: provider.wallet.publicKey,
      };
    })
  );

  await bulkSendTransactions(provider, txns, (status) => {
    console.log(
      `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} batch. ${status.totalProgress} / ${txns.length}`
    );
  });
  console.log("Done");
}
