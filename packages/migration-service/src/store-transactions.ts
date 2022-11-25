import {
  compile,
  init,
  lazySignerKey,
  lazyTransactionsKey
} from "@helium/lazy-transactions-sdk";
import { AccountFetchCache, sendInstructions } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import { inflatePubkeys } from "./utils";

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
  transactions: {
    alias: "t",
    type: "string",
    describe: "The transactions file",
    default: "./transactions.json",
  },
  name: {
    alias: "n",
    type: "string",
    describe: "The name of the stored txns",
  },
  out: {
    describe: "Outfile",
    default: "./transactions-with-lut.json",
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyTransactionsProgram = await init(provider);

  // For efficiency
  new AccountFetchCache({
    connection: provider.connection,
    extendConnection: true,
    commitment: "confirmed",
  });

  const { transactions, ...rest } = JSON.parse(
    fs.readFileSync(argv.transactions).toString()
  );
  inflatePubkeys(transactions);

  const allPubkeys = transactions.flatMap((t) =>
    t.flatMap((t) => [t.programId, ...t.keys.map((k) => k.pubkey)])
  );
  const pubkeysByCount = allPubkeys.reduce((acc, key) => {
    acc[key.toBase58()] ||= 0;
    acc[key.toBase58()] += 1;

    return acc;
  }, {} as Record<string, number>);
  const mostUsedPubkeys = Object.entries(pubkeysByCount)
    .filter(([_, count]) => count > 3)
    .map(([key]) => new PublicKey(key));

  const [sig, lut] = await AddressLookupTableProgram.createLookupTable({
    authority: provider.wallet.publicKey,
    payer: provider.wallet.publicKey,
    recentSlot: await provider.connection.getSlot(),
  });
  const addAddressesInstruction =
    await AddressLookupTableProgram.extendLookupTable({
      payer: provider.wallet.publicKey,
      authority: provider.wallet.publicKey,
      lookupTable: lut,
      addresses: mostUsedPubkeys,
    });
  await sendInstructions(provider, [sig, addAddressesInstruction], []);
  console.log("Created lookup table", lut.toBase58());

  // Execute instructions via lazy transactions
  const lazySigner = lazySignerKey(argv.name)[0];
  const { merkleTree, compiledTransactions } = compile(lazySigner, transactions);
  await lazyTransactionsProgram.methods
    .initializeLazyTransactionsV0({
      root: merkleTree.getRoot().toJSON().data,
      name: argv.name,
    })
    .rpc({ skipPreflight: true });

  console.log(
    `Created lazy transactions ${lazyTransactionsKey(argv.name)[0]} ${
      argv.name
    }`
  );

  const output = {
    transactions: transactions,
    ...rest,
    lookupTable: lut,
    lazyTransactions: argv.name,
  };
  fs.writeFileSync(argv.out, JSON.stringify(output, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
