import Address from "@helium/address";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { init as initDc } from "@helium/data-credits-sdk";
import {
  hotspotConfigKey,
  init as initHem
} from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as initDao,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { init as initLazy } from "@helium/lazy-distributor-sdk";
import { lazySignerKey } from "@helium/lazy-transactions-sdk";
import { AccountFetchCache, chunks, sendInstructions } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";

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
  hnt: {
    type: "string",
    describe: "Pubkey of hnt",
  },
  mobile: {
    type: "string",
    describe: "Pubkey of mobile",
  },
  iot: {
    type: "string",
    describe: "Pubkey of iot",
  },
  out: {
    describe: "Outfile",
    default: "./transactions.json",
  }
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  // For efficiency
  new AccountFetchCache({
    connection: provider.connection,
    extendConnection: true,
    commitment: "confirmed",
  });

  const dataCreditsProgram = await initDc(provider);
  const lazyDistributorProgram = await initLazy(provider);
  const heliumSubDaosProgram = await initDao(provider);
  const hemProgram = await initHem(provider);

  const mobile = new PublicKey(argv.mobile);
  // const iot = new PublicKey(argv.iot);
  const hnt = new PublicKey(argv.hnt);

  const dao = await heliumSubDaosProgram.account.daoV0.fetch(daoKey(hnt)[0])!;
  const dc = dao.dcMint;

  const mobileSubdao = (await subDaoKey(mobile))[0];
  const hsConfigKey = (await hotspotConfigKey(mobileSubdao, "MOBILE"))[0];

  /// TODO: Get actual hotspot data
  const hotspots = await Promise.all(
    new Array(9)
      .fill(0)
      .map(async () => await (await HeliumKeypair.makeRandom()).address.b58)
  );
  const pubkeys = await hemProgram.methods
    .issueHotspotV0({
      eccCompact: Buffer.from(
        await (
          await HeliumKeypair.makeRandom()
        ).publicKey
      ),
    })
    .accounts({
      hotspotOwner: provider.wallet.publicKey,
      hotspotConfig: hsConfigKey,
    })
    .pubkeys();

  const ix = await Promise.all(
    hotspots.map(async (hotspot, index) => {
      const create = await hemProgram.methods
        .genesisIssueHotspotV0({
          eccCompact: Buffer.from(Address.fromB58(hotspot).publicKey),
        })
        .accounts({
          collection: pubkeys.collection,
          collectionMetadata: pubkeys.collectionMetadata,
          collectionMasterEdition: pubkeys.collectionMasterEdition,
          treeAuthority: pubkeys.treeAuthority,
          merkleTree: pubkeys.merkleTree,
          bubblegumSigner: pubkeys.bubblegumSigner,
          tokenMetadataProgram: pubkeys.tokenMetadataProgram,
          logWrapper: pubkeys.logWrapper,
          bubblegumProgram: pubkeys.bubblegumProgram,
          compressionProgram: pubkeys.compressionProgram,
          systemProgram: pubkeys.systemProgram,
          rent: pubkeys.rent,
          hotspotConfig: pubkeys.hotspotConfig,
          hotspotOwner: provider.wallet.publicKey,
          lazySigner: lazySignerKey("helium")[0]
        });
      console.log("Creating hotspot", index);
      return create.instruction();
    })
  );

  const output = {
    transactions: chunks(ix, 3),
    byWallet: {
      "devQQGx2b2eN9X2T2dDejuLtdRQWxJtuJ6cfaNqqGbY": [0]
    }
  };
  fs.writeFileSync(argv.out, JSON.stringify(output, null, 2));

  // const lookupTable = (
  //   await provider.connection.getAddressLookupTable(lut, {
  //     commitment: "processed",
  //   })
  // ).value;
  // await sleep(5000);
  // const message = new TransactionMessage({
  //   payerKey: provider.wallet.publicKey,
  //   recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
  //   instructions: [
  //     ComputeBudgetProgram.setComputeUnitLimit({ units: 1200000 }),
  //     ...ix,
  //   ],
  // }).compileToV0Message([lookupTable]);
  // const transactionWithLookupTable = new VersionedTransaction(message);
  // transactionWithLookupTable.sign([wallet, makerKeypair]);

  // const txid = await provider.connection.sendRawTransaction(
  //   transactionWithLookupTable.serialize()
  // );
  // console.log("Sending", txid);
  // await provider.connection.confirmTransaction(txid, "processed");
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
