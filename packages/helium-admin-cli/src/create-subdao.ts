import * as anchor from '@coral-xyz/anchor';
import { ThresholdType } from '@helium/circuit-breaker-sdk';
import {
  init as initHem,
  rewardableEntityConfigKey,
} from '@helium/helium-entity-manager-sdk';
import {
  daoKey,
  init as initDao,
  subDaoKey,
  threadKey,
  delegatorRewardsPercent,
} from '@helium/helium-sub-daos-sdk';
import {
  init as initLazy,
  lazyDistributorKey,
} from '@helium/lazy-distributor-sdk';
import { oracleSignerKey } from '@helium/rewards-oracle-sdk';
import { sendInstructions, toBN } from '@helium/spl-utils';
import { toU128 } from '@helium/treasury-management-sdk';
import {
  init as initVsr,
  registrarKey,
} from '@helium/voter-stake-registry-sdk';
import {
  getGovernanceProgramVersion,
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
  MintMaxVoteWeightSource,
  SetRealmAuthorityAction,
  withCreateRealm,
  withSetRealmAuthority,
} from '@solana/spl-governance';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import Squads from '@sqds/sdk';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  createAndMint,
  exists,
  getUnixTimestamp,
  isLocalhost,
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquads,
} from './utils';

const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const BASELINE = 0;
const SCALE = 100;

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: 'k',
      describe: 'Anchor wallet keypair',
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    noHotspots: {
      type: 'boolean',
      default: false,
    },
    url: {
      alias: 'u',
      default: 'http://127.0.0.1:8899',
      describe: 'The solana url',
    },
    hntPubkey: {
      type: 'string',
      describe: 'Pubkey of the HNT token',
    },
    dcPubkey: {
      type: 'string',
      describe: 'Pubkey of the DC token',
    },
    name: {
      alias: 'n',
      describe: 'The name of the subdao',
      type: 'string',
      required: true,
    },
    realmName: {
      describe: 'The name of the realm',
      type: 'string',
      required: true,
    },
    subdaoKeypair: {
      type: 'string',
      describe: 'Keypair of the subdao token',
      required: true,
    },
    executeTransaction: {
      type: 'boolean',
    },
    numTokens: {
      type: 'number',
      describe:
        'Number of subdao tokens to pre mint before assigning authority to lazy distributor',
      default: 0,
    },
    bucket: {
      type: 'string',
      describe: 'Bucket URL prefix holding all of the metadata jsons',
      default:
        'https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP',
    },
    rewardsOracleUrl: {
      alias: 'ro',
      type: 'string',
      describe: 'The rewards oracle URL',
      default: 'http://localhost:8080',
    },
    oracleKeypair: {
      type: 'string',
      describe: 'Keypair of the oracle',
      default: `${__dirname}/../../keypairs/oracle.json`,
    },
    aggregatorKeypair: {
      type: 'string',
      describe: 'Keypair of the aggregtor',
    },
    dcBurnAuthority: {
      type: 'string',
      describe: 'The authority to burn DC tokens',
      required: true,
    },
    queue: {
      type: 'string',
      describe: 'Switchbaord oracle queue',
      default: 'uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX',
    },
    crank: {
      type: 'string',
      describe: 'Switchboard crank',
      default: 'UcrnK4w2HXCEjY8z6TcQ9tysYr3c9VcFLdYAU9YQP5e',
    },
    switchboardNetwork: {
      type: 'string',
      describe: 'The switchboard network',
      default: 'mainnet-beta',
    },
    decimals: {
      type: 'number',
      default: 6,
    },
    govProgramId: {
      type: 'string',
      describe: 'Pubkey of the GOV program',
      default: 'hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S',
    },
    councilKeypair: {
      type: 'string',
      describe: 'Keypair of gov council token',
      default: `${__dirname}/../../keypairs/council.json`,
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig for subdao authority. If not provided, your wallet will be the authority',
    },
    authorityIndex: {
      type: 'number',
      describe: 'Authority index for squads. Defaults to 1',
      default: 1,
    },
    delegatorRewardsPercent: {
      type: 'number',
      required: true,
      describe:
        'Percentage of rewards allocated to delegators. Must be between 0-100 and can have 8 decimal places.',
    },
    emissionSchedulePath: {
      required: true,
      describe: 'Path to file that contains the dnt emissions schedule',
      type: 'string',
    },
    activeDeviceAuthority: {
      type: 'string',
      describe: 'The authority that can set hotspot active status',
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
  const councilKeypair = await loadKeypair(argv.councilKeypair);
  const me = provider.wallet.publicKey;

  console.log('Subdao mint', subdaoKeypair.publicKey.toBase58());
  console.log('GOV PID', govProgramId.toBase58());
  console.log('COUNCIL', councilKeypair.publicKey.toBase58());

  const conn = provider.connection;

  const dao = (await daoKey(new PublicKey(argv.hntPubkey!)))[0];
  const subdao = (await subDaoKey(subdaoKeypair.publicKey))[0];
  console.log('DAO', dao.toString());
  console.log('SUBDAO', subdao.toString());
  const daoAcc = await heliumSubDaosProgram.account.daoV0.fetch(dao);

  const calculateThread = threadKey(subdao, 'calculate')[0];
  const issueThread = threadKey(subdao, 'issue')[0];
  const emissionSchedule = await parseEmissionsSchedule(
    argv.emissionSchedulePath
  );

  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: 'finalized',
  });
  let authority = provider.wallet.publicKey;
  const multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }
  if (await exists(conn, subdao)) {
    console.log(
      `Subdao exists. Key: ${subdao.toBase58()}.`
    );
    console.log('Calculate thread', calculateThread.toString());
    console.log('Issue thread', issueThread.toString());
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
      [Buffer.from('native-treasury', 'utf-8'), daoAcc.authority.toBuffer()],
      govProgramId
    )[0];
    payer = daoPayer;
  }

  await createAndMint({
    provider,
    mintKeypair: subdaoKeypair,
    amount: argv.numTokens,
    decimals: argv.decimals,
    metadataUrl: `${argv.bucket}/${name.toLowerCase()}.json`,
    mintAuthority: daoAcc.authority,
    freezeAuthority: daoAcc.authority,
    updateAuthority: authority,
  });

  let instructions: TransactionInstruction[] = [];
  const govProgramVersion = await getGovernanceProgramVersion(
    conn,
    govProgramId,
    isLocalhost(provider) ? 'localnet' : undefined
  );

  const realmName = argv.realmName;
  const realm = await PublicKey.findProgramAddressSync(
    [Buffer.from('governance', 'utf-8'), Buffer.from(realmName, 'utf-8')],
    govProgramId
  )[0];
  console.log('Realm, ', realm.toBase58());
  const isFreshRealm = !(await exists(conn, realm));
  if (isFreshRealm) {
    console.log('Initializing Realm');
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

  const registrar = (await registrarKey(realm, subdaoKeypair.publicKey))[0];
  if (!(await exists(conn, registrar))) {
    console.log('Initializing VSR Registrar');
    instructions.push(
      await heliumVsrProgram.methods
        .initializeRegistrarV0({
          positionUpdateAuthority: null,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accounts({
          realm,
          realmGoverningTokenMint: subdaoKeypair.publicKey,
        })
        .instruction()
    );
    console.log('Configuring VSR voting mint at [0]');
    instructions.push(
      await heliumVsrProgram.methods
        .configureVotingMintV0({
          idx: 0, // idx
          digitShift: -1, // digit shift
          baselineVoteWeightScaledFactor: new anchor.BN(BASELINE * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(SCALE * 1e9),
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

    await sendInstructions(provider, instructions, []);
    instructions = [];

    console.log('Creating max voter record');
    instructions.push(
      await heliumVsrProgram.methods
        .updateMaxVoterWeightV0()
        .accounts({
          registrar,
          realmGoverningTokenMint: subdaoKeypair.publicKey,
        })
        .instruction()
    );
  }

  await sendInstructions(provider, instructions, []);
  instructions = [];

  if (isFreshRealm && !authority.equals(me)) {
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
      .accounts({
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
          name.toUpperCase() == 'IOT' ? toBN(4000000, 0) : toBN(0, 0),
        onboardingDataOnlyDcFee:
          name.toUpperCase() == 'IOT' ? toBN(1000000, 0) : toBN(0, 0),
        delegatorRewardsPercent: delegatorRewardsPercent(
          argv.delegatorRewardsPercent
        ),
        activeDeviceAuthority: argv.activeDeviceAuthority
          ? new PublicKey(argv.activeDeviceAuthority)
          : authority,
      })
      .accounts({
        dao,
        dntMint: subdaoKeypair.publicKey,
        rewardsEscrow,
        hntMint: new PublicKey(argv.hntPubkey!),
        payer,
        dntMintAuthority: daoAcc.authority,
        subDaoFreezeAuthority: daoAcc.authority,
        authority: daoAcc.authority,
      });

    await sendInstructionsOrSquads({
      provider,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
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
            delegatorRewardsPercent: null,
            activeDeviceAuthority: null,
          })
          .accounts({
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
    if (name.toUpperCase() == 'IOT') {
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
        mobileConfig: {
          fullLocationStakingFee: toBN(500000, 0),
          dataonlyLocationStakingFee: toBN(500000, 0),
        },
      };
    }

    instructions.push(
      await hemProgram.methods
        .initializeRewardableEntityConfigV0({
          symbol: name.toUpperCase(),
          settings,
        })
        .accounts({
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
