import yargs from "yargs/yargs";
import * as anchor from "@coral-xyz/anchor";
import format from "pg-format";
import { Client } from "pg";
import os from "os";
import { init, lazyTransactionsKey } from "@helium/lazy-transactions-sdk";
import { bulkSendTransactions, chunks } from "@helium/spl-utils";
import cliProgress from "cli-progress";

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
  name: {
    alias: "n",
    required: true,
    type: "string",
  },
  pgUser: {
    default: "postgres",
  },
  pgPassword: {
    default: "postgres",
  },
  pgDatabase: {
    default: "postgres",
  },
  pgHost: {
    default: "localhost",
  },
  pgPort: {
    default: "5432",
  },
  showProgress: {
    type: "boolean",
    alias: "-p",
    default: false,
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const client = new Client({
    user: argv.pgUser,
    password: argv.pgPassword,
    host: argv.pgHost,
    database: argv.pgDatabase,
    port: argv.pgPort,
    // ssl: {
    //   rejectUnauthorized: false,
    // },
  });
  await client.connect();
  const canopy = (
    await client.query("SELECT * FROM canopy ORDER BY id ASC", [])
  ).rows;
  const canopyNodes: Buffer[] = canopy.map((c) => c.bytes as Buffer);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyTransactionsProgram = await init(provider);

  const chunkSize = 30;
  const lazyTransactions = lazyTransactionsKey(argv.name)[0];
  // @ts-ignore
  const lazyTransactionsAcc =
    await lazyTransactionsProgram.account.lazyTransactionsV0.fetch(
      lazyTransactions
    );

  const canopyChunks = chunks(canopyNodes, chunkSize);
  const txs = await Promise.all(
    canopyChunks.map(async (leaves, index) => {
      const bytes = Buffer.concat(leaves);
      const tx = await lazyTransactionsProgram.methods
        .setCanopyV0({
          offset: 32 * chunkSize * index,
          bytes,
        })
        .accountsStrict({
          lazyTransactions,
          canopy: lazyTransactionsAcc.canopy,
          authority: lazyTransactionsAcc.authority,
        })
        .transaction();

      // @ts-ignore
      tx.feePayer = lazyTransactionsProgram.provider.wallet.publicKey;

      return tx;
    })
  );
  let progress: cliProgress.SingleBar;
  if (argv.showProgress) {
    progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progress.start(txs.length, 0);
  }
  await bulkSendTransactions(provider, txs, (prog) =>
    progress && progress.update(prog.totalProgress)
  );
  progress && progress.stop();
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
