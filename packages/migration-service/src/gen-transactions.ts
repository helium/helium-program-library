import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import {
  hotspotConfigKey,
  init as initHem,
  iotInfoKey,
  PROGRAM_ID as HEM_PROGRAM_ID,
} from "@helium/helium-entity-manager-sdk";
import { init as initVsr, registrarKey } from "@helium/voter-stake-registry-sdk";
import {
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  compile,
  init,
  lazySignerKey,
  lazyTransactionsKey,
  PROGRAM_ID as LAZY_PROGRAM_ID,
} from "@helium/lazy-transactions-sdk";
import { AccountFetchCache, chunks, sendInstructions } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import format from "pg-format";
import { Program } from "@project-serum/anchor";
import {
  ACCOUNT_SIZE, createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { BN } from "bn.js";
import cliProgress from "cli-progress";
import fs from "fs";
import os from "os";
import { Client } from "pg";
import yargs from "yargs/yargs";
import { compress } from "./utils";

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
  dc: {
    type: "string",
    describe: "Pubkey of dc",
  },
  iot: {
    type: "string",
    describe: "Pubkey of iot",
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
  fail: {
    describe: "Failed file",
    default: "./failures.json",
  },
  state: {
    type: "string",
    alias: "s",
    default: "./export.json",
  },
  progress: {
    type: "boolean",
    alias: "-p",
    default: false,
  },
  name: {
    alias: "n",
    required: true,
    type: "string",
  },
  payer: {
    required: true,
    descibe: "The Payer of the transactions from the migration server, that way this can be included in the lut"
  }
});

async function run() {
  const start = new Date().valueOf();
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

  const hemProgram = await initHem(provider);
  const lazyTransactionsProgram = await init(provider);
  const vsrProgram = await initVsr(provider);

  // For speed
  const hemProgramNoResolve = new Program<HeliumEntityManager>(
    hemProgram.idl as HeliumEntityManager,
    hemProgram.programId,
    provider
  ) as Program<HeliumEntityManager>;

  const mobile = new PublicKey(argv.mobile);
  const dc = new PublicKey(argv.dc);
  const iot = new PublicKey(argv.iot);
  const hnt = new PublicKey(argv.hnt);

  const iotSubdao = (await subDaoKey(iot))[0];
  const hsConfigKey = (await hotspotConfigKey(iotSubdao, "IOT"))[0];

  const hotspotPubkeys = await hemProgram.methods
    .issueIotHotspotV0({
      hotspotKey: (await HeliumKeypair.makeRandom()).address.b58,
      isFullHotspot: true,
    })
    .accounts({
      recipient: provider.wallet.publicKey,
      hotspotConfig: hsConfigKey,
    })
    .pubkeys();
  const lazySigner = lazySignerKey(argv.name)[0];

  // Create a lookup table of used pubkeys
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
      addresses: [
        hotspotPubkeys.collection,
        hotspotPubkeys.collectionMetadata,
        hotspotPubkeys.collectionMasterEdition,
        hotspotPubkeys.treeAuthority,
        hotspotPubkeys.merkleTree,
        hotspotPubkeys.bubblegumSigner,
        hotspotPubkeys.tokenMetadataProgram,
        hotspotPubkeys.logWrapper,
        hotspotPubkeys.bubblegumProgram,
        hotspotPubkeys.compressionProgram,
        hotspotPubkeys.systemProgram,
        hotspotPubkeys.rent,
        hotspotPubkeys.hotspotConfig,
        lazyTransactionsKey(argv.name)[0],
        LAZY_PROGRAM_ID,
        lazySigner,
        HEM_PROGRAM_ID,
        dc,
        hnt,
        mobile,
        new PublicKey(argv.payer),
      ],
    });
  await sendInstructions(provider, [sig, addAddressesInstruction], []);
  console.log("Created lookup table", lut.toBase58());

  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const accounts = state.accounts as Record<string, any>;
  const hotspots = Object.entries(state.hotspots) as [string, any][];

  // Add hotspots to accounts
  hotspots.map(([hotspotAddr, hotspot]) => {
    accounts[hotspot.owner] ||= {};
    accounts[hotspot.owner].hotspots ||= [];
    accounts[hotspot.owner].hotspots.push({ ...hotspot, address: hotspotAddr });
  });

  // Show progress if requested
  let progress;
  if (argv.progress) {
    progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progress.start(Object.keys(accounts).length, 0);
  }

  // Keep track of balances so we can send that balance to the lazy signer
  const totalBalances = {
    hnt: new BN(0),
    stakedHnt: new BN(0),
    mobile: new BN(0),
    dc: new BN(0),
    sol: new BN(0),
  };
  // Keep track of unresolved balances so we can reserve them for later;
  const unresolvedBalances = {
    hnt: new BN(0),
    stakedHnt: new BN(0),
    mobile: new BN(0),
    dc: new BN(0),
  };
  const transactionsByWallet = [];
  // Keep track of failed wallets
  const failed = [];
  const ataRent = await provider.connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE
  );
  const infoRent = await provider.connection.getMinimumBalanceForRentExemption(
    32 + 32 + 1 + 8 + 4 + 4 + 1 + 60
  );
  const PER_TX = 0.000005;
  const dustAmount = (PER_TX * 100 * LAMPORTS_PER_SOL) + await provider.connection.getMinimumBalanceForRentExemption(0);
  const dustAmountBn = new BN(dustAmount);
  let ix = 0;
  let txIdx = 0;
  const txIdsToWallet = {};

  const registrar = registrarKey(new PublicKey(argv.realm), hnt)[0];

  /// Iterate through accounts in order so we don't create 1mm promises.
  for (const [address, account] of Object.entries(accounts)) {
    const solAddress = toSolana(address);

    if (solAddress) {
      // Create hotspots
      const hotspotIxs = await Promise.all(
        (account.hotspots || []).map(async (hotspot) => {
          totalBalances.sol = totalBalances.sol.add(new BN(infoRent));
          return hemProgramNoResolve.methods
            .genesisIssueHotspotV0({
              hotspotKey: hotspot.address,
              location:
                hotspot.location != null && hotspot.location != "null"
                  ? new BN(hotspot.location)
                  : null,
              gain: hotspot.gain,
              elevation: hotspot.altitude,
              isFullHotspot: !hotspot.dataonly,
            })
            .accountsStrict({
              collection: hotspotPubkeys.collection,
              collectionMetadata: hotspotPubkeys.collectionMetadata,
              collectionMasterEdition: hotspotPubkeys.collectionMasterEdition,
              treeAuthority: hotspotPubkeys.treeAuthority,
              merkleTree: hotspotPubkeys.merkleTree,
              bubblegumSigner: hotspotPubkeys.bubblegumSigner,
              tokenMetadataProgram: hotspotPubkeys.tokenMetadataProgram,
              logWrapper: hotspotPubkeys.logWrapper,
              bubblegumProgram: hotspotPubkeys.bubblegumProgram,
              compressionProgram: hotspotPubkeys.compressionProgram,
              systemProgram: hotspotPubkeys.systemProgram,
              rent: hotspotPubkeys.rent,
              hotspotConfig: hotspotPubkeys.hotspotConfig,
              recipient: solAddress,
              info: iotInfoKey(
                hotspotPubkeys.hotspotConfig,
                hotspot.address
              )[0],
              lazySigner,
            })
            .instruction();
        })
      );

      const tokenIxs = [];
      const hntBal = new BN(account.hnt);
      const dcBal = new BN(account.dc);
      const mobileBal = new BN(account.mobile);
      const zero = new BN(0);
      if (hntBal.gt(zero)) {
        totalBalances.sol = totalBalances.sol.add(new BN(ataRent));
        totalBalances.hnt = totalBalances.hnt.add(hntBal);
        const { instruction, ata } = createAta(hnt, solAddress, lazySigner);
        tokenIxs.push(instruction);
        tokenIxs.push(createTransfer(hnt, ata, lazySigner, hntBal));
      }
      if (dcBal.gt(zero)) {
        totalBalances.sol = totalBalances.sol.add(new BN(ataRent));
        totalBalances.dc = totalBalances.dc.add(dcBal);
        const { instruction, ata } = createAta(dc, solAddress, lazySigner);
        tokenIxs.push(instruction);
        tokenIxs.push(createTransfer(dc, ata, lazySigner, dcBal));
      }
      if (mobileBal.gt(zero)) {
        totalBalances.sol = totalBalances.sol.add(new BN(ataRent));
        totalBalances.mobile = totalBalances.mobile.add(mobileBal);
        const { instruction, ata } = createAta(mobile, solAddress, lazySigner);
        tokenIxs.push(instruction);
        tokenIxs.push(createTransfer(mobile, ata, lazySigner, mobileBal));
      }

      /// Dust with 100 txns of sol
      tokenIxs.push(
        SystemProgram.transfer({
          fromPubkey: lazySigner,
          toPubkey: solAddress,
          lamports: BigInt(dustAmount),
        })
      );
      totalBalances.sol = totalBalances.sol.add(dustAmountBn);

      const stakedHnt = new BN(account.staked_hnt);
      const mintKeypair = Keypair.generate();
      const stakedInstructions = [];
      if (stakedHnt.gt(new BN(0))) {
        const { instruction: createPosition, pubkeys: { position } } = await vsrProgram.methods
          .initializePositionV0({
            kind: { constant: {} },
            periods: 183, // 6 months
          })
          .accounts({
            registrar,
            mint: mintKeypair.publicKey,
            depositMint: hnt,
            positionAuthority: solAddress,
            payer: lazySigner,
          })
          .prepare();
        const depositPosition = await vsrProgram.methods
          .depositV0({
            amount: stakedHnt,
          })
          .accounts({
            position,
            mint: hnt,
            depositAuthority: lazySigner
          })
          .instruction();

        totalBalances.stakedHnt = totalBalances.stakedHnt.add(stakedHnt);
        stakedInstructions.push(createPosition, depositPosition);
      }

      const ixnGroups = [tokenIxs, stakedInstructions, ...chunks(hotspotIxs, 2)].filter(
        (ixGroup) => ixGroup.length > 0
      );

      transactionsByWallet.push({
        solAddress,
        transactions: ixnGroups,
      });
      ixnGroups.forEach(() => {
        txIdsToWallet[txIdx] = solAddress.toBase58();
        txIdx++;
      });
    } else {
      failed.push({
        address,
        account,
      });
      unresolvedBalances.hnt = unresolvedBalances.hnt.add(new BN(account.hnt));
      unresolvedBalances.dc = unresolvedBalances.dc.add(new BN(account.dc));
      unresolvedBalances.mobile = unresolvedBalances.mobile.add(
        new BN(account.mobile)
      );
      unresolvedBalances.stakedHnt = unresolvedBalances.stakedHnt.add(new BN(account.staked_hnt));
    }

    if (argv.progress) {
      progress.update(++ix);
    }
  }

  if (argv.progress) {
    progress.stop();
  }

  if (failed.length > 0) {
    fs.writeFileSync(argv.fail, JSON.stringify(failed, null, 2));
  }

  const client = new Client({
    user: argv.pgUser,
    password: argv.pgPassword,
    host: argv.pgHost,
    database: argv.pgDatabase,
    port: argv.pgPort,
    ssl: {
      rejectUnauthorized: false
    }
  });
  await client.connect();

  const flatTransactions = transactionsByWallet.flatMap(
    (txn) => txn.transactions
  );
  console.log("Compiling merkle tree");
  const { merkleTree, compiledTransactions } = compile(
    lazySigner,
    flatTransactions
  );

  console.log("Creating tables");
  await client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY NOT NULL,
      wallet VARCHAR(66) NOT NULL,
      compiled bytea NOT NULL,
      proof jsonb NOT NULL,
      lookup_table VARCHAR(66) NOT NULL
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS transactions_wallet_idx ON transactions(wallet)
  `);
  /// 10k txns at time
  let progIdx = 0;
  const chunkSize = 10000;
  const parallelism = 8;
  console.log("Compiling rows");
  const rows = compiledTransactions.map((compiledTransaction) => {
    return [
      compiledTransaction.index,
      txIdsToWallet[compiledTransaction.index],
      compress(compiledTransaction),
      JSON.stringify(
        merkleTree
          .getProof(compiledTransaction.index, false, -1, false, false)
          .proof.map((p) => p.toString("hex"))
      ),
      lut.toBase58(),
    ];
  });
  // Show progress if requested
  let pgProgress;
  console.log("Inserting rows");
  if (argv.progress) {
    pgProgress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    pgProgress.start(flatTransactions.length, 0);
  }

  await Promise.all(
    chunks(chunks(rows, chunkSize), parallelism).map(async (chunk) => {
      for (const c of chunk) {
        const query = format(
          `
        INSERT INTO transactions(
          id, wallet, compiled, proof, lookup_table
        )
        VALUES %L
      `,
          c
        );
        await client.query(query);
        progIdx += chunkSize;
        pgProgress.update(progIdx);
      }
    })
  );
  pgProgress.stop();

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

  console.log(`Lazy transactions signer ${lazySigner} needs:
    HNT: ${totalBalances.hnt.toString()}
    STAKED HNT: ${totalBalances.stakedHnt.toString()}
    DC: ${totalBalances.dc.toString()}
    MOBILE: ${totalBalances.mobile.toString()}
    SOL: ${totalBalances.sol
      .add(new BN(PER_TX * flatTransactions.length * LAMPORTS_PER_SOL))
      .toString()}

    TOTAL TXs: ${flatTransactions.length}
  `);
  console.log(`Unresolved:
    HNT: ${unresolvedBalances.hnt.toString()}
    DC: ${unresolvedBalances.dc.toString()}
    MOBILE: ${unresolvedBalances.mobile.toString()}
  `);

  const finish = new Date().valueOf();

  console.log(`Finished in ${finish - start}ms`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());

function createAta(
  mint: PublicKey,
  to: PublicKey,
  payer: PublicKey
): { instruction: TransactionInstruction; ata: PublicKey } {
  const ata = getAssociatedTokenAddressSync(mint, to, true);
  return {
    instruction: createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      to,
      mint
    ),
    ata,
  };
}

function toSolana(address: string): PublicKey | undefined {
  try {
    const addr = Address.fromB58(address);
    if (addr.keyType === ED25519_KEY_TYPE) return new PublicKey(addr.publicKey);
  } catch (e: any) {
    return undefined;
  }
}

function createTransfer(
  mint: PublicKey,
  dest: PublicKey,
  payer: PublicKey,
  amount: number | anchor.BN
) {
  return createTransferInstruction(
    getAssociatedTokenAddressSync(mint, payer, true),
    dest,
    payer,
    BigInt(amount.toString())
  );
}
