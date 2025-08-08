import * as anchor from "@coral-xyz/anchor";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import {
  PROGRAM_ID,
  accountPayerKey,
  dataCreditsKey,
  init as initDc,
} from "@helium/data-credits-sdk";
import { fanoutKey } from "@helium/fanout-sdk";
import { init as initLazy } from "@helium/lazy-distributor-sdk";
import {
  dataOnlyConfigKey,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, delegatorRewardsPercent, init as initDao } from "@helium/helium-sub-daos-sdk";
import { sendInstructions, toBN } from "@helium/spl-utils";
import {
  init as initVsr,
  registrarKey,
} from "@helium/voter-stake-registry-sdk";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import {
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
  MintMaxVoteWeightSource,
  SetRealmAuthorityAction,
  getGovernanceProgramVersion,
  withCreateRealm,
  withSetRealmAuthority,
} from "@solana/spl-governance";
import { organizationKey } from "@helium/organization-sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import Squads from "@sqds/sdk";
import { BN } from "bn.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import {
  createAndMint,
  isLocalhost,
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquads,
} from "./utils";
import { init } from "@helium/nft-proxy-sdk";
import { oracleSignerKey } from "@helium/rewards-oracle-sdk";

const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const BASELINE = 0;
const SCALE = 100;
const GENESIS_MULTIPLIER = 3;
async function exists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}

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
    hntKeypair: {
      type: "string",
      describe: "Keypair of the HNT token",
      default: `${__dirname}/../../keypairs/hnt.json`,
    },
    dcKeypair: {
      type: "string",
      describe: "Keypair of the Data Credit token",
      default: `${__dirname}/../../keypairs/dc.json`,
    },
    delegatorRewardsPercent: {
      type: "number",
      required: true,
      describe:
        "Percentage of rewards allocated to delegators. Must be between 0-100 and can have 8 decimal places.",
    },
    numHnt: {
      type: "number",
      describe:
        "Number of HNT tokens to pre mint before assigning authority to lazy distributor",
      default: 0,
    },
    numDc: {
      type: "number",
      describe:
        "Number of DC tokens to pre mint before assigning authority to lazy distributor",
      default: 1000,
    },
    bucket: {
      type: "string",
      describe: "Bucket URL prefix holding all of the metadata jsons",
      default:
        "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP",
    },
    emissionSchedulePath: {
      required: true,
      describe: "Path to file that contains the hnt emissions schedule",
      type: "string",
      default: `${__dirname}/../../emissions/hnt.json`,
    },
    hstEmissionSchedulePath: {
      required: true,
      describe: "Path to file that contains the hst emissions schedule",
      type: "string",
      default: `${__dirname}/../../emissions/hst.json`,
    },
    govProgramId: {
      type: "string",
      describe: "Pubkey of the GOV program",
      default: "hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S",
    },
    realmName: {
      type: "string",
      describe: "Name of the realm to be generated",
      default: "Helium",
    },
    councilKeypair: {
      type: "string",
      describe: "Keypair of gov council token",
      default: `${__dirname}/../../keypairs/council.json`,
    },
    councilWallet: {
      type: "string",
      describe: "Pubkey for holding/distributing council tokens",
      default: await loadKeypair(
        `${os.homedir()}/.config/solana/id.json`
      ).publicKey.toBase58(),
    },
    numCouncil: {
      type: "number",
      describe:
        "Number of Gov Council tokens to pre mint before assigning authority to dao",
      default: 10,
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to control the dao. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
    rewardsOracleUrl: {
      alias: "ro",
      type: "string",
      describe: "The rewards oracle URL",
      required: true,
    },
    oracleKey: {
      type: "string",
      describe: "Pubkey of the oracle",
      required: true,
    },
    numHst: {
      type: "number",
      describe:
        "Number of HST tokens to pre mint before assigning authority to lazy distributor",
      default: 0,
    },
    merklePath: {
      type: "string",
      describe: "Path to the merkle keypair",
      default: `${__dirname}/../../keypairs/data-only-merkle.json`,
    },
    proxySeasonsFile: {
      type: "string",
      default: `${__dirname}/../../proxy-seasons.json`,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const dataCreditsProgram = await initDc(provider);
  const heliumSubDaosProgram = await initDao(provider);
  const heliumVsrProgram = await initVsr(provider);
  const hemProgram = await initHem(provider);
  const lazyDistProgram = await initLazy(provider);

  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKeypair = await loadKeypair(argv.councilKeypair);
  const councilWallet = new PublicKey(argv.councilWallet);

  const hntKeypair = loadKeypair(argv.hntKeypair);
  const dcKeypair = loadKeypair(argv.dcKeypair);
  const me = provider.wallet.publicKey;
  const dao = daoKey(hntKeypair.publicKey)[0];

  console.log("HNT", hntKeypair.publicKey.toBase58());
  console.log("DC", dcKeypair.publicKey.toBase58());
  console.log("GOV PID", govProgramId.toBase58());
  console.log("COUNCIL", councilKeypair.publicKey.toBase58());
  console.log("COUNCIL WALLET", councilWallet.toBase58());

  console.log("DAO", dao.toString());

  const proxySeasonsFile = fs.readFileSync(
    argv.proxySeasonsFile,
    "utf8"
  );
  const seasons = JSON.parse(proxySeasonsFile).map(
    (s) => ({
      start: new anchor.BN(Math.floor(Date.parse(s.start) / 1000)),
      end: new anchor.BN(Math.floor(Date.parse(s.end) / 1000)),
    })
  );

  const conn = provider.connection;

  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
    // Fund authority
    const authAcc = await provider.connection.getAccountInfo(authority);
    if (!authAcc || authAcc.lamports < LAMPORTS_PER_SOL) {
      console.log("Funding multisig...");
      await sendInstructions(provider, [
        await SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: authority,
          lamports: LAMPORTS_PER_SOL,
        }),
      ]);
    }
  }

  await createAndMint({
    provider,
    mintKeypair: hntKeypair,
    amount: argv.numHnt,
    metadataUrl: `${argv.bucket}/hnt.json`,
    updateAuthority: authority,
  });

  await createAndMint({
    provider,
    mintKeypair: dcKeypair,
    amount: argv.numDc,
    decimals: 0,
    metadataUrl: `${argv.bucket}/dc.json`,
    updateAuthority: authority,
  });

  await createAndMint({
    provider,
    mintKeypair: councilKeypair,
    amount: argv.numCouncil,
    decimals: 0,
    metadataUrl: `${argv.bucket}/council.json`,
    to: councilWallet,
    updateAuthority: authority,
  });

  let instructions: TransactionInstruction[] = [];
  const govProgramVersion = await getGovernanceProgramVersion(
    conn,
    govProgramId,
    isLocalhost(provider) ? "localnet" : undefined
  );

  const delProgram = await init(provider);
  const {
    pubkeys: { proxyConfig },
    instruction,
  } = await delProgram.methods
    .initializeProxyConfigV0({
      // Set max time to 2 years, though seasons should take precedent
      maxProxyTime: new anchor.BN(24 * 60 * 60 * 365 * 2),
      seasons,
      name: "Helium V1",
    })
    .accountsPartial({
      authority,
    })
    .prepare();

  if (!(await exists(provider.connection, proxyConfig!))) {
    console.log("Creating delegation config");
    await sendInstructions(provider, [instruction]);
  }

  const realmName = argv.realmName;
  const realm = await PublicKey.findProgramAddressSync(
    [Buffer.from("governance", "utf-8"), Buffer.from(realmName, "utf-8")],
    govProgramId
  )[0];

  console.log("Realm, ", realm.toBase58());
  const needRealmCreate = !(await exists(conn, realm));
  if (needRealmCreate) {
    console.log("Initializing Realm");
    await withCreateRealm(
      instructions,
      govProgramId,
      govProgramVersion,
      realmName,
      provider.wallet.publicKey, // realmAuthorityPk
      hntKeypair.publicKey, // communityMintPk
      provider.wallet.publicKey, // payer
      councilKeypair.publicKey, // councilMintPk
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new anchor.BN(1000000000000000), // 10mm vehnt to create governance. Council should be the only one doing this
      new GoverningTokenConfigAccountArgs({
        // community token config
        voterWeightAddin: heliumVsrProgram.programId,
        maxVoterWeightAddin: heliumVsrProgram.programId,
        tokenType: GoverningTokenType.Liquid,
      }),
      new GoverningTokenConfigAccountArgs({
        // council token config
        voterWeightAddin: undefined,
        maxVoterWeightAddin: undefined,
        tokenType: GoverningTokenType.Liquid,
      })
    );
    await sendInstructions(provider, instructions, []);
    instructions = [];
  }

  const registrar = (await registrarKey(realm, hntKeypair.publicKey))[0];
  if (!(await exists(conn, registrar))) {
    console.log("Initializing VSR Registrar");
    instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800000 })
    );
    instructions.push(
      await heliumVsrProgram.methods
        .initializeRegistrarV0({
          positionUpdateAuthority: (await daoKey(hntKeypair.publicKey))[0],
        })
        .accountsPartial({
          realm,
          realmGoverningTokenMint: hntKeypair.publicKey,
          proxyConfig,
        })
        .instruction()
    );
    await sendInstructions(provider, instructions, []);
    instructions = [];
  }

  console.log("Configuring VSR voting mint at [0]");
  instructions.push(
    await heliumVsrProgram.methods
      .configureVotingMintV0({
        idx: 0, // idx
        baselineVoteWeightScaledFactor: new anchor.BN(BASELINE * 1e9),
        maxExtraLockupVoteWeightScaledFactor: new anchor.BN(SCALE * 1e9),
        genesisVotePowerMultiplier: GENESIS_MULTIPLIER,
        // April 28th, 23:59:59 UTC
        genesisVotePowerMultiplierExpirationTs: new anchor.BN("1682726399"),
        lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
      })
      .accountsPartial({
        registrar,
        mint: hntKeypair.publicKey,
      })
      .remainingAccounts([
        {
          pubkey: hntKeypair.publicKey,
          isSigner: false,
          isWritable: false,
        },
      ])
      .instruction()
  );
  await sendInstructions(provider, instructions, []);
  instructions = [];

  console.log(registrar.toString());
  await sendInstructions(provider, instructions, []);
  instructions = [];

  if (needRealmCreate && !authority.equals(me)) {
    withSetRealmAuthority(
      instructions,
      govProgramId,
      govProgramVersion,
      realm,
      provider.wallet.publicKey,
      authority,
      SetRealmAuthorityAction.SetUnchecked
    );
  }
  await sendInstructions(provider, instructions, []);
  instructions = [];

  const dcKey = (await dataCreditsKey(dcKeypair.publicKey))[0];
  console.log("dcpid", PROGRAM_ID.toBase58());
  if (!(await exists(conn, dcKey))) {
    await dataCreditsProgram.methods
      .initializeDataCreditsV0({
        authority,
        config: {
          windowSizeSeconds: new anchor.BN(60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN("1000000000000"),
        },
      })
      .accountsPartial({
        hntMint: hntKeypair.publicKey,
        dcMint: dcKeypair.publicKey,
      })
      .rpc({ skipPreflight: true });

    let tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: accountPayerKey()[0],
        lamports: 5 * LAMPORTS_PER_SOL,
      })
    );
    tx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    tx.feePayer = provider.wallet.publicKey;
    await provider.sendAndConfirm(tx);
  }

  if (!(await exists(conn, dao))) {
    console.log("Initializing DAO");
    const hstEmission = await parseEmissionsSchedule(
      argv.hstEmissionSchedulePath
    );
    const hntEmission = await parseEmissionsSchedule(argv.emissionSchedulePath);
    const currentHstEmission = hstEmission[0];
    const currentHntEmission = hntEmission[0];
    const fanout = fanoutKey("HST")[0];
    const hstPool = getAssociatedTokenAddressSync(
      hntKeypair.publicKey,
      fanout,
      true
    );
  const oracleKey = new PublicKey(argv.oracleKey!);
  const { instruction: initLazyDist, pubkeys: { rewardsEscrow, lazyDistributor } } = await lazyDistProgram.methods
    .initializeLazyDistributorV0({
      authority,
      oracles: [
        {
          oracle: oracleKey,
          url: argv.rewardsOracleUrl,
        },
      ],
      // 5 x epoch rewards in a 24 hour period
      windowConfig: {
        windowSizeSeconds: new anchor.BN(24 * 60 * 60),
        thresholdType: ThresholdType.Absolute as never,
        threshold: new anchor.BN(currentHntEmission.emissionsPerEpoch).mul(
          new anchor.BN(5)
        ),
      },
      approver: oracleSignerKey()[0],
    })
    .accountsPartial({
      payer: authority,
      rewardsMint: hntKeypair.publicKey,
    })
    .prepare();
    const ldExists = await exists(conn, lazyDistributor!);

    await heliumSubDaosProgram.methods
      .initializeDaoV0({
        registrar: registrar,
        authority,
        netEmissionsCap: toBN(34.24, 8),
        // Tx too large to do in initialize dao, so do it with update
        hstEmissionSchedule: [currentHstEmission],
        emissionSchedule: [currentHntEmission],
        proposalNamespace: organizationKey("Helium")[0],
        delegatorRewardsPercent: delegatorRewardsPercent(argv.delegatorRewardsPercent),
      })
      .preInstructions([
        ...(ldExists ? [] : [initLazyDist]),
        createAssociatedTokenAccountIdempotentInstruction(
          provider.wallet.publicKey,
          hstPool,
          fanout,
          hntKeypair.publicKey
        ),
      ])
      .accountsPartial({
        dcMint: dcKeypair.publicKey,
        hntMint: hntKeypair.publicKey,
        hstPool,
        rewardsEscrow,
      })
      .rpc({ skipPreflight: true });

    await sendInstructionsOrSquads({
      provider,
      instructions: [
        await heliumSubDaosProgram.methods
          .updateDaoV0({
            authority,
            emissionSchedule: hntEmission,
            hstEmissionSchedule: hstEmission,
            hstPool: null,
            netEmissionsCap: null,
            proposalNamespace: organizationKey("Helium")[0],
            delegatorRewardsPercent: delegatorRewardsPercent(argv.delegatorRewardsPercent),
            rewardsEscrow: rewardsEscrow ? rewardsEscrow : null,
          })
          .accountsPartial({
            dao,
            authority: authority,
          })
          .instruction(),
      ],
      executeTransaction: true,
      squads,
      multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
      authorityIndex: argv.authorityIndex,
      signers: [],
    });
  }

  if (!(await exists(conn, dataOnlyConfigKey(dao)[0]))) {
    console.log(`Initializing DataOnly Config`);
    let merkle: Keypair;
    if (fs.existsSync(argv.merklePath)) {
      merkle = loadKeypair(argv.merklePath);
    } else {
      merkle = Keypair.generate();
      fs.writeFileSync(
        argv.merklePath,
        JSON.stringify(Array.from(merkle.secretKey))
      );
    }
    const [size, buffer, canopy] = [14, 64, 11];
    const space = getConcurrentMerkleTreeAccountSize(size, buffer, canopy);
    const cost = await provider.connection.getMinimumBalanceForRentExemption(
      space
    );
    if (!(await exists(conn, merkle.publicKey))) {
      await sendInstructions(
        provider,
        [
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: merkle.publicKey,
            lamports: cost,
            space: space,
            programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          }),
        ],
        [merkle]
      );
    }
    await sendInstructionsOrSquads({
      provider,
      instructions: [
        await hemProgram.methods
          .initializeDataOnlyV0({
            authority,
            newTreeDepth: size,
            newTreeBufferSize: buffer,
            newTreeSpace: new BN(
              getConcurrentMerkleTreeAccountSize(size, buffer, canopy)
            ),
            newTreeFeeLamports: new BN(cost / 2 ** size),
            name: "DATAONLY",
            metadataUrl:
              "https://shdw-drive.genesysgo.net/H8b1gZmA2aBqDYxicxawGpznCaNbFSEJ3YnJuawGQ2EQ/data-only.json",
          })
          .accountsPartial({
            dao,
            authority,
            merkleTree: merkle.publicKey,
          })
          .instruction(),
      ],
      executeTransaction: false,
      squads,
      multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
      authorityIndex: argv.authorityIndex,
      signers: [],
    });
  }
}
