import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { mintWindowedBreakerKey } from "@helium/circuit-breaker-sdk";
import { dataCreditsKey, init as initDc } from "@helium/data-credits-sdk";
import {
  entityCreatorKey,
  init as initHem,
  makerKey,
  PROGRAM_ID as HEM_PROGRAM_ID,
  PROGRAM_ID,
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
  fillCanopy,
  getCanopy,
  getCanopySize,
  init,
  lazySignerKey,
  LazyTransaction,
  lazyTransactionsKey,
  PROGRAM_ID as LAZY_PROGRAM_ID,
} from "@helium/lazy-transactions-sdk";
import { chunks, sendInstructions } from "@helium/spl-utils";
import {
  init as initVsr,
  PROGRAM_ID as VSR_PROGRAM_ID,
} from "@helium/voter-stake-registry-sdk";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { PROGRAM_ID as TOKEN_METATDATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
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
import bs58 from "bs58";
import cliProgress from "cli-progress";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { Client } from "pg";
import format from "pg-format";
import yargs from "yargs/yargs";
import { loadKeypair } from "./solana";
import { compress } from "./utils";

type EnrichedIxGroup = {
  isRouter?: boolean;
  signerSeeds: Buffer[][];
  instructions: TransactionInstruction[];
  compute: number;
  size: number;
  wallet: string | undefined;
};

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
    alias: "m",
    default: "../helium-admin-cli/makers.json",
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

  const dao = daoKey(hnt)[0];
  const iotSubdao = (await subDaoKey(iot))[0];
  const mobileSubdao = (await subDaoKey(mobile))[0];

  const makers: { name: string; address: string }[] = JSON.parse(
    fs.readFileSync(argv.makers).toString()
  );
  // Append a special fallthrough maker for hotspots that don't have a maker
  const solAddr = provider.wallet.publicKey;
  const helAddr = new Address(0, 0, ED25519_KEY_TYPE, solAddr.toBuffer());
  makers.push({
    name: "Migrated Helium Hotspot",
    address: helAddr.b58,
  });

  const iotRewardableEntityConfig = rewardableEntityConfigKey(
    iotSubdao,
    "IOT"
  )[0];
  const mobileRewardableEntityConfig = rewardableEntityConfigKey(
    mobileSubdao,
    "MOBILE"
  )[0];
  const hotspotPubkeysRaw = [];

  for (const maker of makers) {
    const helAddr = Address.fromB58(maker.address);
    const solAddr = new PublicKey(helAddr.publicKey);
    const makerKeyp = makerKey(dao, maker.name)[0];

    const makerAcc = await hemProgram.account.makerV0.fetch(makerKeyp);
    const merkleTree = makerAcc.merkleTree;

    hotspotPubkeysRaw.push({
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
      treeAuthority: PublicKey.findProgramAddressSync(
        [merkleTree.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
      )[0],
      merkleTree,
    });
  }
  const hotspotPubkeys: Record<
    string,
    {
      id: string;
      maker: PublicKey;
      makerAuthority: PublicKey;
      collection: PublicKey;
      collectionMetadata: PublicKey;
      collectionMasterEdition: PublicKey;
      treeAuthority: PublicKey;
      merkleTree: PublicKey;
    }
  > = hotspotPubkeysRaw.reduce((acc, cur) => {
    acc[cur.id] = cur;
    return acc;
  }, {});

  const lazySigner = lazySignerKey(argv.name)[0];

  const dataCredits = dataCreditsKey(dc)[0];
  const dcCircuitBreaker = mintWindowedBreakerKey(dc)[0];
  const entityCreator = entityCreatorKey(dao)[0];
  const subDao = subDaoKey(iot)[0];
  const daoAcc = await hsdProgram.account.daoV0.fetch(dao);
  const registrar = daoAcc.registrar;
  const registrarAcc = await vsrProgram.account.registrar.fetch(registrar);
  const registrarCollection = registrarAcc.collection;
  const registrarCollectionMetadata = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      TOKEN_METATDATA_PROGRAM_ID.toBuffer(),
      registrarCollection.toBuffer(),
    ],
    TOKEN_METATDATA_PROGRAM_ID
  )[0];
  const registrarCollectionMasterEdition = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      TOKEN_METATDATA_PROGRAM_ID.toBuffer(),
      registrarCollection.toBuffer(),
      Buffer.from("edition", "utf-8"),
    ],
    TOKEN_METATDATA_PROGRAM_ID
  )[0];

  const bubblegumSigner = PublicKey.findProgramAddressSync(
    [Buffer.from("collection_cpi", "utf-8")],
    BUBBLEGUM_PROGRAM_ID
  )[0];

  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const accounts = state.accounts as Record<string, any>;
  const hotspots = Object.entries(state.hotspots) as [string, any][];

  const blockhash = await provider.connection.getLatestBlockhash();

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
  // Keep track of router burned balances
  const routerBalances = {
    hnt: new BN(0),
    stakedHnt: new BN(0),
    mobile: new BN(0),
  };
  // Keep track of failed wallets
  const failed = [];
  const ataRent = await provider.connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE
  );
  const iotInfoRent =
    await provider.connection.getMinimumBalanceForRentExemption(
      8 +
        32 + // asset
        1 + // bump
        1 +
        8 + // location
        1 +
        4 + // elevation
        1 +
        4 + // gain
        1 + // is full hotspot
        2 + // num location assers
        60 // pad
    );
  const mobileInfoRent =
    await provider.connection.getMinimumBalanceForRentExemption(
      8 +
        32 + // asset
        1 + // bump
        1 +
        8 + // location
        1 +
        4 + // elevation
        1 +
        4 + // gain
        1 + // is full hotspot
        2 + // num location assers
        60 // pad
    );
  const keyToAssetRent =
    await provider.connection.getMinimumBalanceForRentExemption(
      8 +
        32 + // dao
        32 + // asset
        33 + // entity key
        1 // bump seed
    );
  const PER_TX = 0.000005;
  const dustAmount =
    PER_TX * 100 * LAMPORTS_PER_SOL +
    (await provider.connection.getMinimumBalanceForRentExemption(0));
  const dustAmountBn = new BN(dustAmount);
  let ix = 0;
  let txIdx = 0;

  const routers = new Set(Object.keys(state.routers));

  let missingMakers = 0;

  // TODO: Onboard to mobile if they were from either of these makers
  const bobcat5G = makers.find((maker) => maker.name === "Bobcat 5G");
  const freedomFi = makers.find((maker) => maker.name === "FreedomFi");
  // Show progress if requested
  let hotspotProgress;
  if (argv.progress) {
    hotspotProgress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    hotspotProgress.start(hotspots.length, 0);
  }

  const hotspotIxs: EnrichedIxGroup[] = [];
  const canopyPath = `../helium-admin-cli/keypairs/canopy.json`;
  let canopy;
  if (fs.existsSync(canopyPath)) {
    canopy = loadKeypair(canopyPath);
  } else {
    canopy = Keypair.generate();
    fs.writeFileSync(canopyPath, JSON.stringify(Array.from(canopy.secretKey)));
  }
  const lutAddrs = [
    ...Object.values(hotspotPubkeys).flatMap(({ id, ...rest }) =>
      Object.values(rest)
    ),
    canopy.publicKey,
    TOKEN_METATDATA_PROGRAM_ID,
    SPL_NOOP_PROGRAM_ID,
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    mobileRewardableEntityConfig,
    SystemProgram.programId,
    entityCreator,
    bubblegumSigner,
    registrarCollection,
    registrarCollectionMetadata,
    registrarCollectionMasterEdition,
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
  const lutAddrsSet = new Set(lutAddrs.map((addr) => addr.toBase58()));
  function accountSize(ix: TransactionInstruction): number {
    return (
      ix.keys.reduce(
        (acc, account) =>
          acc + (lutAddrsSet.has(account.pubkey.toBase58()) ? 2 : 33),
        0
      ) +
      1 + //  program_id_index
      1 + // accounts len
      1 + // data len
      10 // Extra space just to make sure we fit
    );
  }
  function size(ix: TransactionInstruction): number {
    return ix.data.length + accountSize(ix);
  }

  console.log("Creating hotspot instructions...");
  let cachedAccountSize;
  for (const [hotspotKey, hotspot] of hotspots) {
    const solAddress = toSolana(hotspot.owner);
    totalBalances.sol = totalBalances.sol
      .add(new BN(iotInfoRent))
      .add(new BN(keyToAssetRent));
    const makerId = hotspot.maker || helAddr.b58; // Default (fallthrough) maker

    if (!hotspot.maker) {
      missingMakers++;
    }
    if (solAddress && hotspot.maker_name != "Maker Integration Tests") {
      const hotspotPubkeysForMaker = hotspotPubkeys[makerId];
      if (!hotspotPubkeysForMaker) {
        throw new Error(
          `Maker not found for hotspot ${JSON.stringify(hotspot, null, 2)}`
        );
      }

      const bufferKey = Buffer.from(bs58.decode(hotspotKey));
      const hash = crypto.createHash("sha256").update(bufferKey).digest();
      const iotInfo = PublicKey.findProgramAddressSync(
        [
          Buffer.from("iot_info", "utf-8"),
          iotRewardableEntityConfig.toBuffer(),
          Buffer.from(hash),
        ],
        PROGRAM_ID
      )[0];
      const keyToAsset = PublicKey.findProgramAddressSync(
        [
          Buffer.from("key_to_asset", "utf-8"),
          dao.toBuffer(),
          Buffer.from(hash),
        ],
        PROGRAM_ID
      )[0];
      let remainingAccounts = [];
      // Onboard to mobile if this is also a mobile hotspot
      if (makerId == bobcat5G.address || makerId == freedomFi.address) {
        totalBalances.sol = totalBalances.sol.add(new BN(mobileInfoRent));
        const mobileInfo = PublicKey.findProgramAddressSync(
          [
            Buffer.from("mobile_info", "utf-8"),
            mobileRewardableEntityConfig.toBuffer(),
            Buffer.from(hash),
          ],
          PROGRAM_ID
        )[0];
        remainingAccounts.push(
          {
            pubkey: mobileRewardableEntityConfig,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: mobileInfo,
            isWritable: true,
            isSigner: false,
          }
        );
      }

      const ix = await hemProgramNoResolve.methods
        .genesisIssueHotspotV0({
          entityKey: bufferKey,
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
          entityCreator,
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
          maker: hotspotPubkeysForMaker.maker,
          keyToAsset,
          recipient: solAddress,
          dao,
          info: iotInfo,
          lazySigner,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

      txIdx++;
      hotspotProgress && hotspotProgress.update(txIdx);
      cachedAccountSize = cachedAccountSize || accountSize(ix);
      hotspotIxs.push({
        instructions: [ix],
        signerSeeds: [] as Buffer[][],
        compute: 350000,
        size: cachedAccountSize + ix.data.length,
        wallet: solAddress.toBase58(),
      });
    }
  }

  hotspotProgress && hotspotProgress.stop();

  // Show progress if requested
  let progress;
  if (argv.progress) {
    progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progress.start(Object.keys(accounts).length, 0);
  }
  let positionIndex = 0;
  console.log("Creating account instructions...");
  const accountIxs: EnrichedIxGroup[] = [];
  /// Iterate through accounts in order so we don't create 1mm promises.
  for (const [address, account] of Object.entries(accounts)) {
    const solAddress: PublicKey | undefined = toSolana(address);
    const isRouter = routers.has(address);

    if (isRouter) {
      const dcBal = new BN(account.dc);
      routerBalances.hnt = routerBalances.hnt.add(new BN(account.hnt));
      routerBalances.mobile = routerBalances.mobile.add(new BN(account.mobile));
      routerBalances.stakedHnt = routerBalances.stakedHnt.add(
        new BN(account.staked_hnt)
      );
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

      accountIxs.push({
        instructions: [instruction],
        wallet: solAddress ? solAddress.toBase58() : address,
        signerSeeds: [],
        compute: 100000,
        size: size(instruction),
        isRouter: true,
      });
    } else if (solAddress) {
      // Create hotspots
      const tokenIxs = [];
      const hntBal = new BN(account.hnt);
      const dcBal = new BN(account.dc);
      // Helium uses 8 decimals, we use 6
      const digitShift = new BN(100);
      const mobileBal = new BN(account.mobile).div(digitShift);
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

      accountIxs.push({
        instructions: tokenIxs,
        wallet: solAddress.toBase58(),
        signerSeeds: [],
        compute: 30000 * tokenIxs.length,
        size: tokenIxs.reduce((acc, ix) => acc + size(ix), 0),
      });

      const stakedHnt = new BN(account.staked_hnt);
      if (stakedHnt.gt(new BN(0))) {
        const indexBuf = Buffer.alloc(4);
        indexBuf.writeUint32LE(positionIndex++);
        const pda = [
          Buffer.from("user", "utf-8"),
          Buffer.from(argv.name, "utf-8"),
          indexBuf,
        ];
        const [mintAddress, bump] = PublicKey.findProgramAddressSync(
          pda,
          LAZY_PROGRAM_ID
        );
        const stakedPdas = [[...pda, Buffer.from([bump])]];

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
            mint: mintAddress,
            depositMint: hnt,
            recipient: solAddress,
            payer: lazySigner,
            collection: registrarCollection,
            collectionMetadata: registrarCollectionMetadata,
            collectionMasterEdition: registrarCollectionMasterEdition,
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
        const createIx = SystemProgram.createAccount({
          fromPubkey: lazySigner,
          newAccountPubkey: mintAddress,
          space: 82,
          lamports: ataRent,
          programId: TOKEN_PROGRAM_ID,
        });
        const initMint = createInitializeMintInstruction(
          mintAddress,
          0,
          position,
          position
        );
        accountIxs.push({
          instructions: [createIx, initMint, createPosition, depositPosition],
          wallet: solAddress.toBase58(),
          compute: 1000000,
          size: 1000, //size(createIx), make this tx appear massive so that nothing else gets put with it or we overflow memory
          signerSeeds: stakedPdas,
        });
      }
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
    port: Number(argv.pgPort),
    // ssl: {
    //   rejectUnauthorized: false,
    // },
  });
  await client.connect();

  const flatTransactions = packTransactions([...accountIxs, ...hotspotIxs]);
  console.log("Compiling merkle tree");
  const { merkleTree, compiledTransactions } = compile(
    lazySigner,
    flatTransactions
  );

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
    for (const nodes of chunks(lutChunk, 20)) {
      const instruction = await AddressLookupTableProgram.extendLookupTable({
        payer: provider.wallet.publicKey,
        authority: provider.wallet.publicKey,
        lookupTable: lut,
        addresses: nodes,
      });
      await sendInstructions(provider, [instruction], []);
    }
  }

  const canopyDepth = Math.min(17, merkleTree.depth - 1);
  console.log(
    `Merkle tree depth: ${merkleTree.depth - 1}, canopy depth: ${canopyDepth}`
  );

  console.log("Creating tree");
  const canopySize = getCanopySize(canopyDepth);
  const canopyRent =
    await provider.connection.getMinimumBalanceForRentExemption(canopySize);
  const canopyAcc = await provider.connection.getAccountInfo(canopy.publicKey);
  if (!canopyAcc) {
    await sendInstructions(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: canopy.publicKey,
          space: canopySize,
          lamports: canopyRent,
          programId: lazyTransactionsProgram.programId,
        }),
      ],
      [canopy]
    );
  }
  const ltKey = lazyTransactionsKey(argv.name)[0];
  if (await provider.connection.getAccountInfo(ltKey)) {
    await lazyTransactionsProgram.methods
      .updateLazyTransactionsV0({
        root: merkleTree.getRoot().toJSON().data,
        authority: provider.wallet.publicKey,
      })
      .accounts({
        lazyTransactions: ltKey,
        canopy: canopy.publicKey,
      })
      .rpc({ skipPreflight: true });
  } else {
    await lazyTransactionsProgram.methods
      .initializeLazyTransactionsV0({
        root: merkleTree.getRoot().toJSON().data,
        name: argv.name,
        authority: provider.wallet.publicKey,
        maxDepth: merkleTree.depth - 1,
      })
      .accounts({
        canopy: canopy.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  console.log(
    `Created lazy transactions ${lazyTransactionsKey(argv.name)[0]} ${
      argv.name
    }`
  );

  console.log("Creating tables");
  await client.query(`
    CREATE TABLE IF NOT EXISTS lookup_tables (
      id INTEGER PRIMARY KEY NOT NULL,
      pubkey VARCHAR(66) NOT NULL
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS canopy (
      id INTEGER PRIMARY KEY NOT NULL,
      bytes bytea NOT NULL
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY NOT NULL,
      compiled bytea NOT NULL,
      proof jsonb NOT NULL,
      signers bytea,
      compute integer NOT NULL,
      is_router BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      wallet VARCHAR(66) NOT NULL,
      txid INTEGER NOT NULL
    )
  `);

  await client.query(`
      CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx ON wallet_transactions(wallet);
  `);

  const lutQuery = format(
    `
        INSERT INTO lookup_tables(
          id, pubkey
        )
        VALUES %L
      `,
    luts.map((lut, idx) => [idx, lut.toBase58()])
  );
  await client.query(lutQuery);

  /// 10k txns at time
  let progIdx = 0;
  const chunkSize = 10000;
  const parallelism = 8;
  console.log("Compiling rows");
  const rows = compiledTransactions.map((compiledTransaction, index) => {
    const proof = merkleTree.getProof(
      compiledTransaction.index,
      false,
      -1,
      false,
      false
    ).proof;
    return [
      compiledTransaction.index,
      compress(compiledTransaction),
      JSON.stringify(
        proof.slice(0, proof.length - canopyDepth).map((p) => p.toString("hex"))
      ),
      // Compress seeds as [len, bytes]
      compiledTransaction.signerSeeds.reduce((acc, seeds) => {
        return Buffer.concat([
          acc,
          Buffer.from([seeds.length]),
          seeds.reduce(
            (acc, s) => Buffer.concat([acc, Buffer.from([s.length]), s]),
            Buffer.from([])
          ),
        ]);
      }, Buffer.from([])),
      flatTransactions[index].compute || 200000,
      flatTransactions[index].isRouter || false,
    ];
  });
  // Show progress if requested
  let pgProgressTransactions;
  console.log("Inserting transactions");
  if (argv.progress) {
    pgProgressTransactions = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    pgProgressTransactions.start(flatTransactions.length, 0);
  }

  await Promise.all(
    chunks(chunks(rows, chunkSize), parallelism).map(async (chunk) => {
      for (const c of chunk) {
        const query = format(
          `
        INSERT INTO transactions(
          id, compiled, proof, signers, compute, is_router
        )
        VALUES %L
      `,
          c
        );
        await client.query(query);
        progIdx += chunkSize;
        pgProgressTransactions && pgProgressTransactions.update(progIdx);
      }
    })
  );
  pgProgressTransactions && pgProgressTransactions.stop();

  const walletRows = flatTransactions
    .map((flatTransaction, index) => {
      return Array.from(flatTransaction.wallets).map((wallet) => [
        wallet,
        index,
      ]);
    })
    .flat();
  let pgProgressWallets;
  console.log("Inserting wallet transaction mapping");
  let walletProgIdx = 0;
  if (argv.progress) {
    pgProgressWallets = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    pgProgressWallets.start(walletRows.length, 0);
  }

  await Promise.all(
    chunks(chunks(walletRows, chunkSize), parallelism).map(async (chunk) => {
      for (const c of chunk) {
        const query = format(
          `
        INSERT INTO wallet_transactions(
          wallet, txid
        )
        VALUES %L
      `,
          c
        );
        await client.query(query);
        walletProgIdx += chunkSize;
        pgProgressWallets && pgProgressWallets.update(walletProgIdx);
      }
    })
  );
  pgProgressWallets && pgProgressWallets.stop();

  console.log("inserting canopy");
  const canopyRows = getCanopy({
    merkleTree,
    cacheDepth: canopyDepth,
  }).map((canopy, index) => [index, canopy.node]);

  await Promise.all(
    chunks(chunks(canopyRows, chunkSize), parallelism).map(async (chunk) => {
      for (const c of chunk) {
        const query = format(
          `
          INSERT INTO canopy(
            id, bytes
          )
          VALUES %L
        `,
          c
        );
        await client.query(query);
      }
    })
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
    STAKED HNT: ${unresolvedBalances.stakedHnt.toString()}
    MOBILE: ${unresolvedBalances.mobile.toString()}
    MAKERS: ${missingMakers}
  `);
  console.log(`Router:
    HNT: ${routerBalances.hnt.toString()}
    STAKED HNT: ${routerBalances.stakedHnt.toString()}
    MOBILE: ${routerBalances.mobile.toString()}
  `);

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
      BigInt(totalBalances.hnt.add(totalBalances.stakedHnt).toString())
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

  console.log("Filling canopy, this may fail. Then use fill-canopy script");
  await fillCanopy({
    program: lazyTransactionsProgram,
    lazyTransactions: ltKey,
    merkleTree,
    cacheDepth: canopyDepth,
    showProgress: argv.progress,
  });

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

const MAX_TX_SIZE = 1200;
const MAX_COMPUTE = 1000000;
type TransactionsReturn = LazyTransaction & {
  isRouter?: boolean;
  size: number;
  compute: number;
  wallets: Set<string>;
};
const baseTxSize =
  32 + // recent blockhash
  12 + // header
  3 + // Array lengths
  8 + // descriminator
  1 + // signer seeds size
  4 + //
  32 + // program id
  32 + // payer signer
  32 + // block
  32 + // compute budget
  62 + // signature
  3 * 32; // Leave room for proofs

// Naive packing, just stack them on top of each other until size or compute too high.
function packTransactions(
  instructions: EnrichedIxGroup[]
): TransactionsReturn[] {
  const txs = [];
  let currTx: TransactionsReturn = {
    size: baseTxSize,
    compute: 0,
    wallets: new Set<string>(),
    instructions: [],
    signerSeeds: [],
  };
  for (const ix of instructions) {
    if (
      currTx.size + ix.size <= MAX_TX_SIZE &&
      currTx.compute + ix.compute <= MAX_COMPUTE
    ) {
      currTx.instructions.push(...ix.instructions);
      currTx.compute += ix.compute;
      currTx.size += ix.size;
      currTx.wallets.add(ix.wallet);
      currTx.signerSeeds.push(...ix.signerSeeds);
      currTx.isRouter = ix.isRouter || currTx.isRouter;
    } else {
      txs.push(currTx);
      currTx = {
        size: baseTxSize + ix.size,
        compute: ix.compute,
        wallets: new Set([ix.wallet]),
        instructions: ix.instructions,
        signerSeeds: ix.signerSeeds,
        isRouter: ix.isRouter,
      };
    }
  }

  // Always push last one.
  txs.push(currTx);

  return txs;
}
