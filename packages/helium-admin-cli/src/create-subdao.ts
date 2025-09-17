import * as anchor from "@coral-xyz/anchor";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import {
  init as initHem,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as initDao,
  subDaoKey,
  threadKey,
} from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import { init } from "@helium/nft-proxy-sdk";
import { oracleSignerKey } from "@helium/rewards-oracle-sdk";
import { sendInstructions, toBN } from "@helium/spl-utils";
import { toU128 } from "@helium/treasury-management-sdk";
import {
  init as initVsr,
  registrarKey,
} from "@helium/voter-stake-registry-sdk";
import {
  getGovernanceProgramVersion
} from "@solana/spl-governance";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import Squads from "@sqds/sdk";
import BN from "bn.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import {
  createAndMint,
  exists,
  getUnixTimestamp,
  isLocalhost,
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquads,
} from "./utils";

const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const BASELINE = 0;
const SCALE = 100;

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    noHotspots: {
      type: "boolean",
      default: false,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    hntPubkey: {
      type: "string",
      describe: "Pubkey of the HNT token",
    },
    dcPubkey: {
      type: "string",
      describe: "Pubkey of the DC token",
    },
    name: {
      alias: "n",
      describe: "The name of the subdao",
      type: "string",
      required: true,
    },
    realmName: {
      describe: "The name of the realm",
      type: "string",
      required: true,
    },
    subdaoKeypair: {
      type: "string",
      describe: "Keypair of the subdao token",
      required: true,
    },
    executeTransaction: {
      type: "boolean",
    },
    numTokens: {
      type: "number",
      describe:
        "Number of subdao tokens to pre mint before assigning authority to lazy distributor",
      default: 0,
    },
    bucket: {
      type: "string",
      describe: "Bucket URL prefix holding all of the metadata jsons",
      default:
        "https://entities.nft.helium.io/v2/tokens",
    },
    rewardsOracleUrl: {
      alias: "ro",
      type: "string",
      describe: "The rewards oracle URL",
      default: "http://localhost:8080",
    },
    oracleKeypair: {
      type: "string",
      describe: "Keypair of the oracle",
      default: `${__dirname}/../../keypairs/oracle.json`,
    },
    aggregatorKeypair: {
      type: "string",
      describe: "Keypair of the aggregtor",
    },
    dcBurnAuthority: {
      type: "string",
      describe: "The authority to burn DC tokens",
      required: true,
    },
    queue: {
      type: "string",
      describe: "Switchbaord oracle queue",
      default: "uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX",
    },
    crank: {
      type: "string",
      describe: "Switchboard crank",
      default: "UcrnK4w2HXCEjY8z6TcQ9tysYr3c9VcFLdYAU9YQP5e",
    },
    switchboardNetwork: {
      type: "string",
      describe: "The switchboard network",
      default: "mainnet-beta",
    },
    decimals: {
      type: "number",
      default: 6,
    },
    govProgramId: {
      type: "string",
      describe: "Pubkey of the GOV program",
      default: "hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig for subdao authority. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
    emissionSchedulePath: {
      required: true,
      describe: "Path to file that contains the dnt emissions schedule",
      type: "string",
    },
    activeDeviceAuthority: {
      type: "string",
      describe: "The authority that can set hotspot active status",
    },
    delegationSeasonsFile: {
      type: "string",
      default: `${__dirname}/../../proxy-seasons.json`,
    },
  });
  const argv = await yarg.argv;
  console.log(argv.url);
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const name = argv.name;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyDistributorProgram = await initLazy(provider);
  const heliumSubDaosProgram = await initDao(provider);
  const hemProgram = await initHem(provider);
  const heliumVsrProgram = await initVsr(provider);

  const walletKP = loadKeypair(argv.wallet);
  const wallet = new anchor.Wallet(walletKP);
  const aggKeypair = await loadKeypair(
    argv.aggregatorKeypair ||
      `${__dirname}/../../keypairs/aggregator-${name}.json`
  );
  const subdaoKeypair = await loadKeypair(argv.subdaoKeypair);
  const oracleKeypair = await loadKeypair(argv.oracleKeypair);
  const oracleKey = oracleKeypair.publicKey;
  const rewardsOracleUrl = argv.rewardsOracleUrl;
  const govProgramId = new PublicKey(argv.govProgramId);
  const me = provider.wallet.publicKey;

  console.log("Subdao mint", subdaoKeypair.publicKey.toBase58());
  console.log("GOV PID", govProgramId.toBase58());

  const conn = provider.connection;

  const dao = (await daoKey(new PublicKey(argv.hntPubkey!)))[0];
  const subdao = (await subDaoKey(subdaoKeypair.publicKey))[0];
  console.log("DAO", dao.toString());
  console.log("SUBDAO", subdao.toString());
  const daoAcc = await heliumSubDaosProgram.account.daoV0.fetch(dao);

  const delegationSeasonsFile = fs.readFileSync(
    argv.delegationSeasonsFile,
    "utf8"
  );
  const seasons = JSON.parse(delegationSeasonsFile).map(
    (s) => new anchor.BN(Math.floor(Date.parse(s) / 1000))
  );

  const calculateThread = threadKey(subdao, "calculate")[0];
  const issueThread = threadKey(subdao, "issue")[0];
  const emissionSchedule = await parseEmissionsSchedule(
    argv.emissionSchedulePath
  );

  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
  let authority = provider.wallet.publicKey;
  const multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }
  if (await exists(conn, subdao)) {
    console.log(`Subdao exists. Key: ${subdao.toBase58()}.`);
    console.log("Calculate thread", calculateThread.toString());
    console.log("Issue thread", issueThread.toString());
    return;
  }
  const [lazyDist] = await lazyDistributorKey(subdaoKeypair.publicKey);
  const rewardsEscrow = await getAssociatedTokenAddress(
    subdaoKeypair.publicKey,
    lazyDist,
    true
  );

  let payer = provider.wallet.publicKey;
  const auth = await provider.connection.getAccountInfo(daoAcc.authority);
  if (auth!.owner.equals(govProgramId)) {
    const daoPayer = PublicKey.findProgramAddressSync(
      [Buffer.from("native-treasury", "utf-8"), daoAcc.authority.toBuffer()],
      govProgramId
    )[0];
    payer = daoPayer;
  }

  await createAndMint({
    provider,
    mintKeypair: subdaoKeypair,
    amount: argv.numTokens,
    decimals: argv.decimals,
    metadataUrl: `${argv.bucket}/${name.toLowerCase()}`,
    mintAuthority: daoAcc.authority,
    freezeAuthority: daoAcc.authority,
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

  const registrar = (await registrarKey(realm, subdaoKeypair.publicKey))[0];
  if (!(await exists(conn, registrar))) {
    console.log("Initializing VSR Registrar");
    instructions.push(
      await heliumVsrProgram.methods
        .initializeRegistrarV0({
          positionUpdateAuthority: null,
        })
        .accountsPartial({
          realm,
          realmGoverningTokenMint: subdaoKeypair.publicKey,
          proxyConfig,
        })
        .instruction()
    );
    console.log("Configuring VSR voting mint at [0]");
    instructions.push(
      await heliumVsrProgram.methods
        .configureVotingMintV0({
          idx: 0, // idx
          baselineVoteWeightScaledFactor: new anchor.BN(BASELINE * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(SCALE * 1e9),
          genesisVotePowerMultiplier: 0,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(
            Number(await getUnixTimestamp(provider))
          ),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
        })
        .accountsPartial({
          registrar,
          mint: subdaoKeypair.publicKey,
        })
        .remainingAccounts([
          {
            pubkey: subdaoKeypair.publicKey,
            isSigner: false,
            isWritable: false,
          },
        ])
        .instruction()
    );

    await sendInstructions(provider, instructions, []);
    instructions = [];
  }

  await sendInstructions(provider, instructions, []);

  if (!(await exists(conn, lazyDist))) {
    console.log(`Initializing ${name} lazy distributor`);
    await lazyDistributorProgram.methods
      .initializeLazyDistributorV0({
        authority: daoAcc.authority,
        oracles: [
          {
            oracle: oracleKey,
            url: rewardsOracleUrl,
          },
        ],
        // 5 x epoch rewards in a 24 hour period
        windowConfig: {
          windowSizeSeconds: new anchor.BN(24 * 60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN(emissionSchedule[0].emissionsPerEpoch).mul(
            new anchor.BN(5)
          ),
        },
        approver: oracleSignerKey()[0],
      })
      .accountsPartial({
        rewardsMint: subdaoKeypair.publicKey,
        rewardsEscrow,
      })
      .rpc({ skipPreflight: true });
  }

  if (!(await exists(conn, subdao))) {
    console.log(`Initializing ${name} SubDAO`);
    const currentDntEmission = emissionSchedule[0];

    const initSubdaoMethod = await heliumSubDaosProgram.methods
      .initializeSubDaoV0({
        registrar: registrar,
        dcBurnAuthority: new PublicKey(argv.dcBurnAuthority),
        authority,
        // Tx to large to do here, do it with update
        emissionSchedule: [currentDntEmission],
        // Linear curve
        treasuryCurve: {
          exponentialCurveV0: {
            k: toU128(0),
          },
        } as any,
        // $40 for iot, $0 for mobile
        onboardingDcFee:
          name.toUpperCase() == "IOT" ? toBN(4000000, 0) : toBN(0, 0),
        onboardingDataOnlyDcFee:
          name.toUpperCase() == "IOT" ? toBN(1000000, 0) : toBN(0, 0),
        activeDeviceAuthority: argv.activeDeviceAuthority
          ? new PublicKey(argv.activeDeviceAuthority)
          : authority,
      })
      .accountsPartial({
        dao,
        dntMint: subdaoKeypair.publicKey,
        hntMint: new PublicKey(argv.hntPubkey!),
        payer,
        dntMintAuthority: daoAcc.authority,
        subDaoFreezeAuthority: daoAcc.authority,
        authority: daoAcc.authority,
      });

    await sendInstructionsOrSquads({
      provider,
      instructions: [
        await initSubdaoMethod.instruction(),
      ],
      executeTransaction: true,
      squads,
      multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
      authorityIndex: argv.authorityIndex,
      signers: [],
    });

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: authority,
        lamports: LAMPORTS_PER_SOL * 2,
      }),
    ]);

    const { subDao } = await initSubdaoMethod.pubkeys();
    await sendInstructionsOrSquads({
      provider,
      instructions: [
        await heliumSubDaosProgram.methods
          .updateSubDaoV0({
            authority,
            emissionSchedule,
            dcBurnAuthority: null,
            onboardingDcFee: null,
            onboardingDataOnlyDcFee: null,
            registrar: null,
            activeDeviceAuthority: null,
          })
          .accountsPartial({
            subDao,
            authority,
            payer: authority,
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

  const hsConfigKey = (
    await rewardableEntityConfigKey(subdao, name.toUpperCase())
  )[0];
  if (
    !(await provider.connection.getAccountInfo(hsConfigKey)) &&
    !argv.noHotspots
  ) {
    const instructions: TransactionInstruction[] = [];
    console.log(`Initalizing ${name} RewardableEntityConfig`);
    let settings;
    if (name.toUpperCase() == "IOT") {
      settings = {
        iotConfig: {
          minGain: 10,
          maxGain: 150,
          fullLocationStakingFee: toBN(500000, 0),
          dataonlyLocationStakingFee: toBN(500000, 0),
        } as any,
      };
    } else {
      settings = {
        mobileConfigV2: {
          feesByDevice: [
            {
              deviceType: { cbrs: {} },
              dcOnboardingFee: toBN(40, 5),
              locationStakingFee: toBN(10, 5),
              mobileOnboardingFeeUsd: toBN(0, 6),
              reserved: new Array(8).fill(new BN(0)),
            },
            {
              deviceType: { wifiIndoor: {} },
              dcOnboardingFee: toBN(10, 5),
              locationStakingFee: toBN(0, 5),
              mobileOnboardingFeeUsd: toBN(10, 6),
              reserved: new Array(8).fill(new BN(0)),
            },
            {
              deviceType: { wifiOutdoor: {} },
              dcOnboardingFee: toBN(10, 5),
              locationStakingFee: toBN(0, 5),
              mobileOnboardingFeeUsd: toBN(20, 6),
              reserved: new Array(8).fill(new BN(0)),
            },
          ],
        },
      };
    }

    instructions.push(
      await hemProgram.methods
        .initializeRewardableEntityConfigV0({
          symbol: name.toUpperCase(),
          settings,
          stakingRequirement: toBN(0, 0),
        })
        .accountsPartial({
          subDao: subdao,
          payer: me,
          authority,
        })
        .instruction()
    );

    await sendInstructionsOrSquads({
      provider,
      instructions,
      squads,
      executeTransaction: true,
      multisig: multisig!,
      authorityIndex: argv.authorityIndex,
    });
  }
}
