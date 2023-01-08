import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { mintWindowedBreakerKey } from "@helium/circuit-breaker-sdk";
import { dataCreditsKey, init as initDc } from "@helium/data-credits-sdk";
import {
  init as initHem,
  iotInfoKey,
  makerKey,
  PROGRAM_ID as HEM_PROGRAM_ID,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as initHsd,
  subDaoKey,
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
import {
  init as initVsr,
  PROGRAM_ID as VSR_PROGRAM_ID,
} from "@helium/voter-stake-registry-sdk";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { PROGRAM_ID as TOKEN_METATDATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { TreeNode } from "@solana/spl-account-compression/dist/types/merkle-tree";
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "bn.js";
import cliProgress from "cli-progress";
import fs from "fs";
import os from "os";
import { Client } from "pg";
import format from "pg-format";
import * as Collections from "typescript-collections";
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
    required: true,
  },
  hst: {
    type: "string",
    describe: "Pubkey of hst",
    required: true,
  },
  mobile: {
    type: "string",
    describe: "Pubkey of mobile",
    required: true,
  },
  dc: {
    type: "string",
    describe: "Pubkey of dc",
    required: true,
  },
  iot: {
    type: "string",
    describe: "Pubkey of iot",
    required: true,
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
  makers: {
    type: "string",
    alias: "s",
    default: "./makers.json",
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
    descibe:
      "The Payer of the transactions from the migration server, that way this can be included in the lut",
  },
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
  const dcProgram = await initDc(provider);
  const hsdProgram = await initHsd(provider);

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
  const hst = new PublicKey(argv.hst);

  const iotSubdao = (await subDaoKey(iot))[0];
  const mobileSubdao = (await subDaoKey(mobile))[0];
  const hsConfigKey = (await rewardableEntityConfigKey(iotSubdao, "IOT"))[0];

  const makers: { name: string; address: string }[] = JSON.parse(
    fs.readFileSync(argv.makers).toString()
  );

  const iotRewardableEntityConfig = rewardableEntityConfigKey(
    iotSubdao,
    "IOT"
  )[0];
  const mobileRewardableEntityConfig = rewardableEntityConfigKey(
    mobile,
    "MOBILE"
  )[0];
  const hotspotPubkeys: Record<
    string,
    {
      maker: PublicKey;
      makerAuthority: PublicKey;
      collection: PublicKey;
      collectionMetadata: PublicKey;
      collectionMasterEdition: PublicKey;
      treeAuthority: PublicKey;
      merkleTree: PublicKey;
    }
  > = (
    await Promise.all(
      makers.map(async (maker) => {
        const helAddr = Address.fromB58(maker.address);
        const solAddr = new PublicKey(helAddr.publicKey);
        const makerKeyp = makerKey(maker.name)[0];
        const makerAcc = await hemProgram.account.makerV0.fetch(solAddr);
        const merkleTree = makerAcc.merkleTree;

        return {
          id: maker.address,
          maker: makerKeyp,
          makerAuthority: solAddr,
          collection: makerAcc.collection,
          collectionMetadata: PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata", "utf-8"),
              TOKEN_METATDATA_PROGRAM_ID.toBuffer(),
              makerAcc.collection.toBuffer(),
            ],
            TOKEN_METATDATA_PROGRAM_ID
          )[0],
          collectionMasterEdition: PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata", "utf-8"),
              TOKEN_METATDATA_PROGRAM_ID.toBuffer(),
              makerAcc.collection.toBuffer(),
              Buffer.from("edition", "utf-8"),
            ],
            TOKEN_METATDATA_PROGRAM_ID
          )[0],
          treeAuthory: PublicKey.findProgramAddressSync(
            [merkleTree.toBuffer()],
            BUBBLEGUM_PROGRAM_ID
          )[0],
          merkleTree,
        };
      })
    )
  ).reduce((acc, cur) => {
    acc[cur.id] = cur;
    return acc;
  }, {});

  const lazySigner = lazySignerKey(argv.name)[0];

  const dataCredits = dataCreditsKey(dc)[0];
  const dcCircuitBreaker = mintWindowedBreakerKey(dc)[0];
  const dao = daoKey(hnt)[0];
  const subDao = subDaoKey(iot)[0];
  const daoAcc = await hsdProgram.account.daoV0.fetch(dao);
  const registrar = daoAcc.registrar;

  const bubblegumSigner = PublicKey.findProgramAddressSync(
    [Buffer.from("collection_cpi", "utf-8")],
    BUBBLEGUM_PROGRAM_ID
  )[0];

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
    hst: new BN(0),
  };
  // Keep track of unresolved balances so we can reserve them for later;
  const unresolvedBalances = {
    hnt: new BN(0),
    stakedHnt: new BN(0),
    mobile: new BN(0),
    dc: new BN(0),
    hst: new BN(0),
  };
  // Keep track of router burned balances
  const routerBalances = {
    hnt: new BN(0),
    stakedHnt: new BN(0),
    mobile: new BN(0),
    hst: new BN(0),
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
  const dustAmount =
    PER_TX * 100 * LAMPORTS_PER_SOL +
    (await provider.connection.getMinimumBalanceForRentExemption(0));
  const dustAmountBn = new BN(dustAmount);
  let ix = 0;
  let txIdx = 0;
  const txIdsToWallet = {};

  const routers = new Set(Object.keys(state.routers));

  /// Iterate through accounts in order so we don't create 1mm promises.
  for (const [address, account] of Object.entries(accounts)) {
    const solAddress = toSolana(address);
    const isRouter = routers.has(address);

    if (isRouter) {
      const dcBal = new BN(account.dc);
      routerBalances.hnt = routerBalances.hnt.add(new BN(account.hnt));
      routerBalances.mobile = routerBalances.mobile.add(new BN(account.mobile));
      routerBalances.stakedHnt = routerBalances.stakedHnt.add(
        new BN(account.staked_hnt)
      );
      routerBalances.hst = routerBalances.hst.add(new BN(account.hst));
      const instruction = await dcProgram.methods
        .genesisIssueDelegatedDataCreditsV0({
          amount: dcBal,
          routerKey: address,
        })
        .accounts({
          dcMint: dc,
          dataCredits,
          lazySigner,
          circuitBreaker: dcCircuitBreaker,
          dao,
          subDao,
        })
        .instruction();

      transactionsByWallet.push({
        solAddress,
        transactions: [[instruction]],
      });
      txIdsToWallet[txIdx++] = address;
    } else if (solAddress) {
      // Create hotspots
      const hotspotIxs = await Promise.all(
        (account.hotspots || []).map(async (hotspot) => {
          totalBalances.sol = totalBalances.sol.add(new BN(infoRent));
          const makerId = hotspot.maker;
          const hotspotPubkeysForMaker = hotspotPubkeys[makerId];

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
              numLocationAsserts: hotspot.nonce
                ? new BN(hotspot.nonce).toNumber()
                : 0,
            })
            .accountsStrict({
              collection: hotspotPubkeysForMaker.collection,
              collectionMetadata: hotspotPubkeysForMaker.collectionMetadata,
              collectionMasterEdition:
                hotspotPubkeysForMaker.collectionMasterEdition,
              treeAuthority: hotspotPubkeysForMaker.treeAuthority,
              merkleTree: hotspotPubkeysForMaker.merkleTree,
              bubblegumSigner,
              tokenMetadataProgram: TOKEN_METATDATA_PROGRAM_ID,
              logWrapper: SPL_NOOP_PROGRAM_ID,
              bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
              compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              rewardableEntityConfig: iotRewardableEntityConfig,
              maker: PublicKey.default, // TODO: Fix this!
              recipient: solAddress,
              info: iotInfoKey(iotRewardableEntityConfig, hotspot.address)[0],
              lazySigner,
            })
            .instruction();
        })
      );

      const tokenIxs = [];
      const hntBal = new BN(account.hnt);
      const dcBal = new BN(account.dc);
      const mobileBal = new BN(account.mobile);
      const hstBal = new BN(account.hst);
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
      if (hstBal.gt(zero)) {
        totalBalances.sol = totalBalances.sol.add(new BN(ataRent));
        totalBalances.hst = totalBalances.hst.add(hstBal);
        const { instruction, ata } = createAta(hst, solAddress, lazySigner);
        tokenIxs.push(instruction);
        tokenIxs.push(createTransfer(hst, ata, lazySigner, hstBal));
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
        const {
          instruction: createPosition,
          pubkeys: { position },
        } = await vsrProgram.methods
          .initializePositionV0({
            kind: { constant: {} },
            periods: 183, // 6 months
          })
          .accounts({
            registrar,
            mint: mintKeypair.publicKey,
            depositMint: hnt,
            recipient: solAddress,
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
            depositAuthority: lazySigner,
            registrar,
          })
          .instruction();

        totalBalances.stakedHnt = totalBalances.stakedHnt.add(stakedHnt);
        stakedInstructions.push(createPosition, depositPosition);
      }

      const ixnGroups = [
        tokenIxs,
        stakedInstructions,
        ...chunks(hotspotIxs, 1),
      ].filter((ixGroup) => ixGroup.length > 0);

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
      unresolvedBalances.hst = unresolvedBalances.hst.add(new BN(account.hst));
      unresolvedBalances.hnt = unresolvedBalances.hnt.add(new BN(account.hnt));
      unresolvedBalances.dc = unresolvedBalances.dc.add(new BN(account.dc));
      unresolvedBalances.mobile = unresolvedBalances.mobile.add(
        new BN(account.mobile)
      );
      unresolvedBalances.stakedHnt = unresolvedBalances.stakedHnt.add(
        new BN(account.staked_hnt)
      );
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
    // ssl: {
    //   rejectUnauthorized: false,
    // },
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

  console.log("Extending merkle tree with cached nodes");
  let rootNode = merkleTree.leaves[0];
  while (typeof rootNode.parent !== "undefined") {
    rootNode = rootNode.parent;
  }

  let numCachedNodes = 128; // Cache 128 nodes in the lookup table (7 levels) to reduce the size of tx
  const cachedNodes: PublicKey[] = [];
  const queue = new Collections.Queue<TreeNode>();
  queue.enqueue(rootNode);
  while (cachedNodes.length < numCachedNodes) {
    const top = queue.dequeue();
    if (!top.left || !top.right) {
      break;
    }
    cachedNodes.push(new PublicKey(top.left.node));
    cachedNodes.push(new PublicKey(top.right.node));
    queue.enqueue(top.left);
    queue.enqueue(top.right);
  }
  const addresses = [
    ...Object.values(hotspotPubkeys).flatMap((v) => Object.values(v)),
    TOKEN_METATDATA_PROGRAM_ID,
    SPL_NOOP_PROGRAM_ID,
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    SystemProgram.programId,
    bubblegumSigner,
    hst,
    dao,
    subDao,
    registrar,
    lazyTransactionsKey(argv.name)[0],
    LAZY_PROGRAM_ID,
    lazySigner,
    HEM_PROGRAM_ID,
    dc,
    hnt,
    mobile,
    new PublicKey(argv.payer),
    ASSOCIATED_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    SYSVAR_RENT_PUBKEY,
    VSR_PROGRAM_ID,
    BUBBLEGUM_PROGRAM_ID,
  ];
  const lutAddrs = [...addresses, ...cachedNodes];
  const luts = [];
  for (const lutChunk of chunks(lutAddrs, 256)) {
    const [sig, lut] = await AddressLookupTableProgram.createLookupTable({
      authority: provider.wallet.publicKey,
      payer: provider.wallet.publicKey,
      recentSlot: await provider.connection.getSlot(),
    });
    await sendInstructions(provider, [sig], []);
    luts.push(lut);
    console.log("Created lookup table", lut.toBase58());
    for (const nodes of chunks(lutChunk, 5)) {
      const instruction = await AddressLookupTableProgram.extendLookupTable({
        payer: provider.wallet.publicKey,
        authority: provider.wallet.publicKey,
        lookupTable: lut,
        addresses: nodes,
      });
      await sendInstructions(provider, [instruction], []);
    }
  }

  console.log("Creating tables");
  await client.query(`
    CREATE TABLE IF NOT EXISTS lookup_tables (
      id INTEGER PRIMARY KEY NOT NULL,
      pubkey VARCHAR(66) NOT NULL,
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY NOT NULL,
      wallet VARCHAR(66) NOT NULL,
      compiled bytea NOT NULL,
      proof jsonb NOT NULL,
      is_router BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS transactions_wallet_idx ON transactions(wallet)
  `);

  const lutQuery = format(
    `
        INSERT INTO lookup_tables(
          id, pubkey
        )
        VALUES %L
      `,
    luts.map((lut) => lut.toBase58())
  );
  await client.query(lutQuery);

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
      routers.has(txIdsToWallet[compiledTransaction.index]),
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
          id, wallet, compiled, proof, lookup_table, is_router
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

  const ltKey = lazyTransactionsKey(argv.name)[0];
  if (await provider.connection.getAccountInfo(ltKey)) {
    await lazyTransactionsProgram.methods
      .updateLazyTransactionsV0({
        root: merkleTree.getRoot().toJSON().data,
        authority: provider.wallet.publicKey,
      })
      .accounts({
        lazyTransactions: ltKey,
      })
      .rpc({ skipPreflight: true });
  } else {
    await lazyTransactionsProgram.methods
      .initializeLazyTransactionsV0({
        root: merkleTree.getRoot().toJSON().data,
        name: argv.name,
        authority: provider.wallet.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  console.log(
    `Created lazy transactions ${lazyTransactionsKey(argv.name)[0]} ${
      argv.name
    }`
  );

  console.log(`Lazy transactions signer ${lazySigner} needs:
    HNT: ${totalBalances.hnt.toString()}
    HST: ${totalBalances.hst.toString()}
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
    HST: ${unresolvedBalances.hst.toString()}
    DC: ${unresolvedBalances.dc.toString()}
    STAKED HNT: ${unresolvedBalances.stakedHnt.toString()}
    MOBILE: ${unresolvedBalances.mobile.toString()}
  `);
  console.log(`Router:
    HNT: ${routerBalances.hnt.toString()}
    HST: ${routerBalances.hst.toString()}
    STAKED HNT: ${routerBalances.stakedHnt.toString()}
    MOBILE: ${routerBalances.mobile.toString()}
  `);
  const finish = new Date().valueOf();

  console.log("Loading up lazy signer with hnt, dc, mobile...");
  const me = provider.wallet.publicKey;
  const transfers = [
    await createAssociatedTokenAccountIdempotentInstruction(
      me,
      getAssociatedTokenAddressSync(hnt, lazySigner, true),
      lazySigner,
      hnt
    ),
    await createTransferInstruction(
      getAssociatedTokenAddressSync(hnt, me),
      getAssociatedTokenAddressSync(hnt, lazySigner, true),
      me,
      BigInt(totalBalances.hnt.toString())
    ),
    await createAssociatedTokenAccountIdempotentInstruction(
      me,
      getAssociatedTokenAddressSync(hst, lazySigner, true),
      lazySigner,
      hst
    ),
    await createTransferInstruction(
      getAssociatedTokenAddressSync(hst, me),
      getAssociatedTokenAddressSync(hst, lazySigner, true),
      me,
      BigInt(totalBalances.hst.toString())
    ),
    await createAssociatedTokenAccountIdempotentInstruction(
      me,
      getAssociatedTokenAddressSync(dc, lazySigner, true),
      lazySigner,
      dc
    ),
    await createTransferInstruction(
      getAssociatedTokenAddressSync(dc, me),
      getAssociatedTokenAddressSync(dc, lazySigner, true),
      me,
      BigInt(totalBalances.dc.toString())
    ),
    await createAssociatedTokenAccountIdempotentInstruction(
      me,
      getAssociatedTokenAddressSync(mobile, lazySigner, true),
      lazySigner,
      mobile
    ),
    await createTransferInstruction(
      getAssociatedTokenAddressSync(mobile, me),
      getAssociatedTokenAddressSync(mobile, lazySigner, true),
      me,
      BigInt(totalBalances.mobile.toString())
    ),
  ];
  await sendInstructions(provider, transfers);

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
