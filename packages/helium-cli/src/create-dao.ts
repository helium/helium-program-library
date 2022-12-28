import { ThresholdType } from "@helium/circuit-breaker-sdk";
import { dataCreditsKey, init as initDc } from "@helium/data-credits-sdk";
import { daoKey, init as initDao } from "@helium/helium-sub-daos-sdk";
import { init as initLazy } from "@helium/lazy-distributor-sdk";
import {
  registrarKey,
  init as initVsr,
} from "@helium/voter-stake-registry-sdk";
import * as anchor from "@project-serum/anchor";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
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
} from "@solana/spl-governance";
import os from "os";
import yargs from "yargs/yargs";
import {
  createAndMint,
  getTimestampFromDays,
  getUnixTimestamp,
  loadKeypair,
} from "./utils";
import { sendInstructions } from "@helium/spl-utils";

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
  hntKeypair: {
    type: "string",
    describe: "Keypair of the HNT token",
    default: "./keypairs/hnt.json",
  },
  dcKeypair: {
    type: "string",
    describe: "Keypair of the Data Credit token",
    default: "./keypairs/dc.json",
  },
  makerKeypair: {
    type: "string",
    describe: "Keypair of a maker",
    default: `${os.homedir()}/.config/solana/id.json`,
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
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  },
  realmName: {
    type: "string",
    describe: "Name of the realm to be generated",
    default: "Helium",
  },
  councilKeypair: {
    type: "string",
    describe: "Keypair of gov council token",
    default: "./keypairs/council.json",
  },
  councilTokenHolder: {
    type: "string",
    describe: "Pubkey for holding/distributing council tokens",
    default: `${os.homedir()}/.config/solana/id.json`,
  },
  numCouncil: {
    type: "number",
    describe:
      "Number of Gov Council tokens to pre mint before assigning authority to dao",
    default: 10,
  },
});

const HNT_EPOCH_REWARDS = 10000000000;
const MOBILE_EPOCH_REWARDS = 5000000000;
const MIN_LOCKUP = 15811200; // 6 months
const MAX_LOCKUP = MIN_LOCKUP * 8;
const SCALE = 100;
const GENESIS_MULTIPLIER = 3;
async function exists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dataCreditsProgram = await initDc(provider);
  const lazyDistributorProgram = await initLazy(provider);
  const heliumSubDaosProgram = await initDao(provider);
  const heliumVsrProgram = await initVsr(provider);

  const hntKeypair = await loadKeypair(argv.hntKeypair);
  const dcKeypair = await loadKeypair(argv.dcKeypair);
  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKeypair = await loadKeypair(argv.councilKeypair);

  console.log("HNT", hntKeypair.publicKey.toBase58());
  console.log("DC", dcKeypair.publicKey.toBase58());
  console.log("GOV PID", govProgramId.toBase58());
  console.log("COUNCIL", councilKeypair.publicKey.toBase58());

  const conn = provider.connection;

  await createAndMint({
    provider,
    mintKeypair: hntKeypair,
    amount: argv.numHnt,
    metadataUrl: `${argv.bucket}/hnt.json`,
  });

  await createAndMint({
    provider,
    mintKeypair: dcKeypair,
    amount: argv.numDc,
    decimals: 0,
    metadataUrl: `${argv.bucket}/dc.json`,
  });

  await createAndMint({
    provider,
    mintKeypair: councilKeypair,
    amount: argv.numCouncil,
    decimals: 0,
    metadataUrl: `${argv.bucket}/council.json}`,
  });

  const dcKey = (await dataCreditsKey(dcKeypair.publicKey))[0];
  if (!(await exists(conn, dcKey))) {
    await dataCreditsProgram.methods
      .initializeDataCreditsV0({
        authority: provider.wallet.publicKey,
        config: {
          windowSizeSeconds: new anchor.BN(60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN("1000000000000"),
        },
      })
      .accounts({
        hntMint: hntKeypair.publicKey,
        dcMint: dcKeypair.publicKey,
        hntPriceOracle: new PublicKey(
          "CqFJLrT4rSpA46RQkVYWn8tdBDuQ7p7RXcp6Um76oaph"
        ), // TODO: Replace with HNT price feed,
      })
      .rpc({ skipPreflight: true });
  }

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
      hntKeypair.publicKey, // communityMintPk
      provider.wallet.publicKey, // payer
      councilKeypair.publicKey, // councilMintPk
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new anchor.BN(1), // minCommunityWeightToCreateGovernance
      new GoverningTokenConfigAccountArgs({
        // community token config
        voterWeightAddin: heliumVsrProgram.programId,
        maxVoterWeightAddin: undefined,
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

  const dao = (await daoKey(hntKeypair.publicKey))[0];
  const registrar = (await registrarKey(realm, hntKeypair.publicKey))[0];

  if (!(await exists(conn, registrar))) {
    console.log("Initializing VSR Registrar");
    instructions.push(
      await heliumVsrProgram.methods
        .initializeRegistrarV0({
          positionUpdateAuthority: dao,
        })
        .accounts({
          realm,
          realmGoverningTokenMint: hntKeypair.publicKey,
        })
        .instruction()
    );
  }

  if (!(await exists(conn, dao))) {
    console.log("Initializing DAO");
    await heliumSubDaosProgram.methods
      .initializeDaoV0({
        registrar: registrar,
        authority: provider.wallet.publicKey,
        emissionSchedule: [
          {
            startUnixTime: new anchor.BN(0),
            emissionsPerEpoch: new anchor.BN(HNT_EPOCH_REWARDS),
          },
        ],
      })
      .accounts({
        dcMint: dcKeypair.publicKey,
        hntMint: hntKeypair.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  console.log("Configuring VSR voting mint at [0]");
  instructions.push(
    await heliumVsrProgram.methods
      .configureVotingMintV0({
        idx: 0, // idx
        digitShift: 0, // digit shift
        lockedVoteWeightScaledFactor: new anchor.BN(1_000_000_000),
        minimumRequiredLockupSecs: new anchor.BN(MIN_LOCKUP),
        maxExtraLockupVoteWeightScaledFactor: new anchor.BN(SCALE),
        genesisVotePowerMultiplier: GENESIS_MULTIPLIER,
        genesisVotePowerMultiplierExpirationTs: new anchor.BN(
          Number(await getUnixTimestamp(provider)) + getTimestampFromDays(7)
        ),
        lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
      })
      .accounts({
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

  const governance = await PublicKey.findProgramAddressSync(
    [
      Buffer.from("account-governance", "utf-8"),
      realm.toBuffer(),
      PublicKey.default.toBuffer(),
    ],
    govProgramId
  )[0];
  if (!(await exists(conn, governance))) {
    console.log(`Initializing Governance on Realm: ${realmName}`);
    await withCreateGovernance(
      instructions,
      govProgramId,
      govProgramVersion,
      realm,
      hntKeypair.publicKey,
      new GovernanceConfig({
        communityVoteThreshold: new VoteThreshold({
          type: VoteThresholdType.YesVotePercentage,
          value: 60,
        }),
        minCommunityTokensToCreateProposal: new anchor.BN(1),
        minInstructionHoldUpTime: 0,
        maxVotingTime: getTimestampFromDays(3),
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
      PublicKey.default,
      provider.wallet.publicKey,
      provider.wallet.publicKey
    );

    withSetRealmAuthority(
      instructions,
      govProgramId,
      govProgramVersion,
      realm,
      provider.wallet.publicKey,
      governance,
      SetRealmAuthorityAction.SetChecked
    );
  }

  await sendInstructions(provider, instructions, []);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
