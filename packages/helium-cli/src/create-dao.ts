import { ThresholdType } from "@helium/circuit-breaker-sdk";
import { dataCreditsKey, init as initDc } from "@helium/data-credits-sdk";
import { daoKey, init as initDao } from "@helium/helium-sub-daos-sdk";
import { init as initLazy } from "@helium/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getGovernanceProgramVersion,
  MintMaxVoteWeightSource,
  withCreateRealm,
  GoverningTokenType,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  GovernanceConfig,
  withSetRealmConfig,
  withCreateMintGovernance,
  GoverningTokenConfigArgs,
  GoverningTokenConfigAccountArgs,
} from "@solana/spl-governance";
import { BN } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { createAndMint, getTimestampFromDays, loadKeypair } from "./utils";
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
  councilKeypair: {
    type: "string",
    describe: "Keypair of gov council token",
    default: "./keypairs/council.json",
  },
  numCouncil: {
    type: "number",
    describe:
      "Number of Gov Council tokens to pre mint before assigning authority to dao",
    default: 7,
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
  },
});

const HNT_EPOCH_REWARDS = 10000000000;
const MOBILE_EPOCH_REWARDS = 5000000000;
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
  //const heliumVsrProgram = await initVsr(provider);

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
          windowSizeSeconds: new BN(60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new BN("1000000000000"),
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

  const dao = (await daoKey(hntKeypair.publicKey))[0];
  if (!(await exists(conn, dao))) {
    console.log("Initializing DAO");
    await heliumSubDaosProgram.methods
      .initializeDaoV0({
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

  let instructions: TransactionInstruction[] = [];
  let signers: Keypair[] = [];
  const govProgramVersion = await getGovernanceProgramVersion(
    conn,
    govProgramId
  );

  const name = `Realm-${dao.toBase58().slice(0, 6)}`;
  const communityMintMaxVoteWeightSource =
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION;

  const realmPk = await withCreateRealm(
    instructions,
    govProgramId,
    govProgramVersion,
    name,
    provider.wallet.publicKey, // realmAuthorityPk
    hntKeypair.publicKey, // communityMintPk
    provider.wallet.publicKey, // payer
    councilKeypair.publicKey, // councilMintPk
    communityMintMaxVoteWeightSource,
    new BN(1), // minCommunityWeightToCreateGovernance
    undefined,
    undefined
  );

  await withSetRealmConfig(
    instructions,
    govProgramId,
    govProgramVersion,
    realmPk,
    provider.wallet.publicKey, // realmAuthorityPk
    councilKeypair.publicKey, // councilMintPk
    communityMintMaxVoteWeightSource,
    new BN(1),
    new GoverningTokenConfigAccountArgs({
      voterWeightAddin: undefined,
      maxVoterWeightAddin: undefined,
      tokenType: GoverningTokenType.Liquid,
    }),
    new GoverningTokenConfigAccountArgs({
      voterWeightAddin: undefined,
      maxVoterWeightAddin: undefined,
      tokenType: GoverningTokenType.Liquid,
    }),
    provider.wallet.publicKey // payer
  );

  await sendInstructions(provider, instructions, signers);
  instructions = [];
  signers = [];

  const govConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 60,
    }),
    minCommunityTokensToCreateProposal: new BN(1),
    minInstructionHoldUpTime: 0,
    maxVotingTime: getTimestampFromDays(3),
    communityVoteTipping: VoteTipping.Strict,
    councilVoteTipping: VoteTipping.Strict,
    minCouncilTokensToCreateProposal: new BN(1),
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 10,
    }),
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 10,
    }),
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 80,
    }),
    votingCoolOffTime: 0,
    depositExemptProposalCount: 0,
  });
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
