import { thresholdPercent, ThresholdType } from "@helium/circuit-breaker-sdk";
import {
  rewardableEntityConfigKey,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as initDao,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import {
  registrarKey,
  init as initVsr,
} from "@helium/voter-stake-registry-sdk";
import { sendInstructions, toBN } from "@helium/spl-utils";
import { toU128 } from "@helium/treasury-management-sdk";
import * as anchor from "@project-serum/anchor";
import { idlAddress } from "@project-serum/anchor/dist/cjs/idl";
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Cluster,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import {
  AggregatorHistoryBuffer,
  QueueAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import {
  getGovernanceProgramVersion,
  MintMaxVoteWeightSource,
  withCreateRealm,
  GoverningTokenType,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  GovernanceConfig,
  GoverningTokenConfigAccountArgs,
  withCreateGovernance,
  withSetRealmAuthority,
  SetRealmAuthorityAction,
  getTokenOwnerRecordAddress,
} from "@solana/spl-governance";
import os from "os";
import yargs from "yargs/yargs";
import {
  createAndMint,
  exists,
  getTimestampFromDays,
  getUnixTimestamp,
  isLocalhost,
  loadKeypair,
  sendInstructionsOrCreateProposal,
} from "./utils";

const { hideBin } = require("yargs/helpers");

const yarg = yargs(hideBin(process.argv)).options({
  wallet: {
    alias: "k",
    describe: "Anchor wallet keypair",
    default: `${os.homedir()}/.config/solana/id.json`,
  },
  noHotspots: {
    type: "boolean",
    default: false
  },
  url: {
    alias: "u",
    default: "http://127.0.0.1:8899",
    describe: "The solana url",
  },
  hntPubkey: {
    type: "string",
    describe: "Pubkey of the HNT token",
    default: loadKeypair(`${__dirname}/../keypairs/hnt.json`).publicKey,
  },
  dcPubkey: {
    type: "string",
    describe: "Pubkey of the DC token",
    default: loadKeypair(`${__dirname}/../keypairs/dc.json`).publicKey,
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
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
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
    default: `${__dirname}/../keypairs/oracle.json`,
  },
  aggregatorKeypair: {
    type: "string",
    describe: "Keypair of the aggregtor",
    default: `${__dirname}/../keypairs/aggregator.json`,
  },
  merkleKeypair: {
    type: "string",
    describe: "Keypair of the merkle tree",
    default: `${__dirname}/../keypairs/merkle.json`,
  },
  dcBurnAuthority: {
    type: "string",
    describe: "The authority to burn DC tokens",
    required: true,
  },
  activeDeviceOracleUrl: {
    alias: "ao",
    type: "string",
    describe: "The active device oracle URL",
    default: "http://localhost:8081",
  },
  queue: {
    type: "string",
    describe: "Switchbaord oracle queue",
    default: "F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy",
  },
  crank: {
    type: "string",
    describe: "Switchboard crank",
    default: "GN9jjCy2THzZxhYqZETmPM3my8vg4R5JyNkgULddUMa5",
  },
  switchboardNetwork: {
    type: "string",
    describe: "The switchboard network",
    default: "devnet",
  },
  startEpochRewards: {
    type: "number",
    describe: "The starting epoch rewards (yearly)",
    required: true,
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  },
  councilKeypair: {
    type: "string",
    describe: "Keypair of gov council token",
    default: `${__dirname}/../keypairs/council.json`,
  },
  noGovernance: {
    type: "boolean",
    describe: "If this is set, governance will be skipped. Ensure that you also included --noGovernance when running create-dao",
    default: false,
  }
});

const MIN_LOCKUP = 15811200; // 6 months
const MAX_LOCKUP = MIN_LOCKUP * 8;
const SCALE = 100;

async function run() {
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

  const wallet = loadKeypair(argv.wallet);
  const aggKeypair = await loadKeypair(argv.aggregatorKeypair);
  const subdaoKeypair = await loadKeypair(argv.subdaoKeypair);
  const oracleKeypair = await loadKeypair(argv.oracleKeypair);
  const oracleKey = oracleKeypair.publicKey;
  const rewardsOracleUrl = argv.rewardsOracleUrl;
  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKeypair = await loadKeypair(argv.councilKeypair);

  console.log("Subdao mint", subdaoKeypair.publicKey.toBase58());
  console.log("GOV PID", govProgramId.toBase58());
  console.log("COUNCIL", councilKeypair.publicKey.toBase58());

  const conn = provider.connection;

  const dao = (await daoKey(new PublicKey(argv.hntPubkey)))[0];
  const subdao = (await subDaoKey(subdaoKeypair.publicKey))[0];
  console.log("DAO", dao.toString());
  console.log("SUBDAO", subdao.toString());
  const daoAcc = await heliumSubDaosProgram.account.daoV0.fetch(dao);

  const thread = PublicKey.findProgramAddressSync(
    [
      Buffer.from("thread", "utf8"),
      subdao.toBuffer(),
      Buffer.from("end-epoch", "utf8"),
    ],
    new PublicKey(
      "3XXuUFfweXBwFgFfYaejLvZE4cGZiHgKiGfMtdxNzYmv"
    )
  )[0];
  if (exists(conn, subdao)) {
    const subDao = await heliumSubDaosProgram.account.subDaoV0.fetch(subdao);
    
    console.log(
      `Subdao exists. Key: ${subdao.toBase58()}. Agg: ${subDao.activeDeviceAggregator.toBase58()}}. Thread: ${thread.toString()}`
    );
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
  if (auth.owner.equals(govProgramId)) {
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
    metadataUrl: `${argv.bucket}/${name.toLowerCase()}.json`,
    mintAuthority: daoAcc.authority,
    freezeAuthority: daoAcc.authority,
  });

  let instructions: TransactionInstruction[] = [];
  const govProgramVersion = await getGovernanceProgramVersion(
    conn,
    govProgramId
  );

  const realmName = argv.realmName;
  const realm = await PublicKey.findProgramAddressSync(
    [Buffer.from("governance", "utf-8"), Buffer.from(realmName, "utf-8")],
    govProgramId
  )[0];
  if (!(await exists(conn, realm))) {
    console.log("Initializing Realm");
    await withCreateRealm(
      instructions,
      govProgramId,
      govProgramVersion,
      realmName,
      provider.wallet.publicKey, // realmAuthorityPk
      subdaoKeypair.publicKey, // communityMintPk
      provider.wallet.publicKey, // payer
      councilKeypair.publicKey, // councilMintPk
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new anchor.BN(100000000000000), // TODO: 1mm vehnt to create governance
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
  }

  const registrar = (await registrarKey(realm, subdaoKeypair.publicKey))[0];
  if (!(await exists(conn, registrar))) {
    console.log("Initializing VSR Registrar");
    instructions.push(
      await heliumVsrProgram.methods
        .initializeRegistrarV0({
          positionUpdateAuthority: null,
        })
        .accounts({
          realm,
          realmGoverningTokenMint: subdaoKeypair.publicKey,
        })
        .instruction()
    );
    console.log("Configuring VSR voting mint at [0]");
    instructions.push(
      await heliumVsrProgram.methods
        .configureVotingMintV0({
          idx: 0, // idx
          digitShift: 0, // digit shift
          lockedVoteWeightScaledFactor: new anchor.BN(1_000_000_000),
          minimumRequiredLockupSecs: new anchor.BN(MIN_LOCKUP),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(SCALE),
          genesisVotePowerMultiplier: 0,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(
            Number(await getUnixTimestamp(provider))
          ),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
        })
        .accounts({
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
  }

  await sendInstructions(provider, instructions, []);
  instructions = [];

  const me = provider.wallet.publicKey;
  const governance = await PublicKey.findProgramAddressSync(
    [
      Buffer.from("account-governance", "utf-8"),
      realm.toBuffer(),
      subdao.toBuffer(),
    ],
    govProgramId
  )[0];
  const nativeTreasury = await PublicKey.findProgramAddressSync(
    [
      Buffer.from("native-treasury", "utf-8"),
      governance.toBuffer(),
    ],
    govProgramId
  )[0];
  console.log(
    `Using governance treasury ${nativeTreasury.toBase58()} as authority`
  );
  const balance = await provider.connection.getAccountInfo(nativeTreasury);
  if (!balance) {
    console.log("Transfering 1 sol to governance treasury for subdao creation");
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: nativeTreasury,
        lamports: BigInt(toBN(1, 9).toString()),
      }),
    ]);
  }
  if (!(await exists(conn, governance))) {
    console.log(`Initializing Governance on Realm: ${realmName}`);
    await withCreateGovernance(
      instructions,
      govProgramId,
      govProgramVersion,
      realm,
      subdao,
      new GovernanceConfig({
        communityVoteThreshold: new VoteThreshold({
          type: VoteThresholdType.YesVotePercentage,
          value: 60,
        }),
        minCommunityTokensToCreateProposal: new anchor.BN(1),
        minInstructionHoldUpTime: 0,
        maxVotingTime: getTimestampFromDays(30),
        communityVoteTipping: VoteTipping.Strict,
        councilVoteTipping: VoteTipping.Early,
        minCouncilTokensToCreateProposal: new anchor.BN(1),
        councilVoteThreshold: new VoteThreshold({
          type: VoteThresholdType.YesVotePercentage,
          value: 50,
        }),
        councilVetoVoteThreshold: new VoteThreshold({
          type: VoteThresholdType.YesVotePercentage,
          value: 50,
        }),
        communityVetoVoteThreshold: new VoteThreshold({
          type: VoteThresholdType.Disabled,
        }),
        votingCoolOffTime: 0,
        depositExemptProposalCount: 10,
      }),
      await getTokenOwnerRecordAddress(
        govProgramId,
        realm,
        subdaoKeypair.publicKey,
        provider.wallet.publicKey
      ),
      provider.wallet.publicKey,
      provider.wallet.publicKey
    );

    withSetRealmAuthority(
      instructions,
      govProgramId,
      govProgramVersion,
      realm,
      provider.wallet.publicKey,
      daoAcc.authority,
      SetRealmAuthorityAction.SetUnchecked
    );
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
        // 10 x epoch rewards in a 24 hour period
        windowConfig: {
          windowSizeSeconds: new anchor.BN(24 * 60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN(10 * argv.startEpochRewards),
        },
      })
      .accounts({
        rewardsMint: subdaoKeypair.publicKey,
        rewardsEscrow,
      })
      .rpc({ skipPreflight: true });
  }

  if (!(await exists(conn, subdao))) {
    let aggregatorKey = new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"); // value cloned from mainnet to localnet
    if (!isLocalhost(provider)) {
      console.log("Initializing switchboard oracle");
      const switchboard = await SwitchboardProgram.load(
        argv.switchboardNetwork as Cluster,
        provider.connection,
        wallet
      );
      const queueAccount = new QueueAccount(
        switchboard,
        new PublicKey(argv.queue)
      );
      const agg = aggKeypair.publicKey;
      if (!(await exists(conn, agg))) {
        const [agg, _] = await queueAccount.createFeed({
          keypair: aggKeypair,
          batchSize: 3,
          minRequiredOracleResults: 2,
          minRequiredJobResults: 1,
          minUpdateDelaySeconds: 60 * 60, // hourly
          fundAmount: 0.2,
          enable: true,
          crankPubkey: new PublicKey(argv.crank),
          jobs: [
            {
              data: OracleJob.encodeDelimited(
                OracleJob.fromObject({
                  tasks: [
                    {
                      httpTask: {
                        url:
                          argv.activeDeviceOracleUrl + "/" + name.toLowerCase(),
                      },
                    },
                    {
                      jsonParseTask: {
                        path: "$.count",
                      },
                    },
                  ],
                })
              ).finish(),
            },
          ],
        });
        console.log("Created active device aggregator", agg.publicKey.toBase58());
        await AggregatorHistoryBuffer.create(switchboard, {
          aggregatorAccount: agg,
          maxSamples: 24 * 31, // Give us a month of active device data. If we fail to run end epoch, RIP.
        });
        aggregatorKey = agg.publicKey;
      }
    }
    
    const instructions: TransactionInstruction[] = [];

    console.log(`Initializing ${name} SubDAO`);
    const initSubdaoMethod = await heliumSubDaosProgram.methods
      .initializeSubDaoV0({
        dcBurnAuthority: new PublicKey(argv.dcBurnAuthority),
        authority: argv.noGovernance ? me : governance,
        emissionSchedule: emissionSchedule(argv.startEpochRewards),
        // Linear curve
        treasuryCurve: {
          exponentialCurveV0: {
            k: toU128(1),
          },
        } as any,
        // 20% in a day
        treasuryWindowConfig: {
          windowSizeSeconds: new anchor.BN(24 * 60 * 60),
          thresholdType: ThresholdType.Percent as never,
          threshold: thresholdPercent(20),
        },
        onboardingDcFee: toBN(4000000, 0), // $40 in dc
      })
      .accounts({
        dao,
        dntMint: subdaoKeypair.publicKey,
        rewardsEscrow,
        hntMint: new PublicKey(argv.hntPubkey),
        activeDeviceAggregator: aggregatorKey,
        payer,
        dntMintAuthority: daoAcc.authority,
        subDaoFreezeAuthority: daoAcc.authority,
        authority: daoAcc.authority,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
    if (argv.noGovernance) {
      await initSubdaoMethod.rpc({ skipPreflight: true });
    } else {
      instructions.push(await initSubdaoMethod.instruction())
      await sendInstructionsOrCreateProposal({
        provider,
        instructions,
        walletSigner: wallet,
        signers: [],
        govProgramId,
        proposalName: `Create ${name} SubDAO`,
        votingMint: councilKeypair.publicKey,
      });
    }

    console.log("Transfering sol to thread")
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: thread,
        lamports: BigInt(toBN(0.1, 9).toString()),
      }),
    ]);
  }

  const hsConfigKey = (await rewardableEntityConfigKey(subdao, name.toUpperCase()))[0];
  if (!(await provider.connection.getAccountInfo(hsConfigKey)) && !argv.noHotspots) {
    const instructions: TransactionInstruction[] = [];
    console.log(`Initalizing ${name} RewardableEntityConfig`);
    let settings;
    if (name.toUpperCase() == "IOT") {
      settings = {
        iotConfig: {
          minGain: 10,
          maxGain: 150,
          fullLocationStakingFee: toBN(1000000, 0),
          dataonlyLocationStakingFee: toBN(500000, 0),
        } as any,
      }
    } else {
      settings = {
        mobileConfig: {
          fullLocationStakingFee: toBN(1000000, 0),
          dataonlyLocationStakingFee: toBN(500000, 0),
        }
      }
    }

    instructions.push(
      await hemProgram.methods
        .initializeRewardableEntityConfigV0({
          symbol: name.toUpperCase(),
          settings
        })
        .accounts({
          subDao: subdao,
          payer: argv.noGovernance ? me : nativeTreasury,
          authority: argv.noGovernance ? me : governance,
        })
        .instruction()
    );

    await sendInstructionsOrCreateProposal({
      provider,
      instructions,
      walletSigner: wallet,
      signers: [],
      govProgramId,
      proposalName: `Create ${name} RewardableEntityConfig`,
      votingMint: councilKeypair.publicKey,
    });
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());

function emissionSchedule(
  startEpochRewards: number
): { startUnixTime: anchor.BN; emissionsPerEpoch: anchor.BN }[] {
  const now = new Date().getDate() / 1000;
  // Do 6 years out, halving every  years
  // Any larger and it wont fit in a tx
  return new Array(3).fill(0).map((_, twoYear) => {
    return {
      startUnixTime: new anchor.BN(twoYear * 2 * 31557600 + now), // 2 years in seconds
      emissionsPerEpoch: toBN(
        startEpochRewards / Math.pow(2, twoYear) / (365.25 * 24), // Break into daily
        8
      ),
    };
  });
}
