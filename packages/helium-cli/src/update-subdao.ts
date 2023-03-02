import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { init as initHem, rewardableEntityConfigKey } from "@helium/helium-entity-manager-sdk";
import * as anchor from "@coral-xyz/anchor";
import {
  Cluster,
  PublicKey,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { isLocalhost, loadKeypair, sendInstructionsOrCreateProposal } from "./utils";
import { parseEmissionsSchedule } from "./utils";
import { mintWindowedBreakerKey, accountWindowedBreakerKey, init as initCb } from "@helium/circuit-breaker-sdk"
import { AggregatorAccount, SwitchboardProgram } from "@switchboard-xyz/solana.js";

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
  dntMint: {
    required: true,
    type: "string",
    describe: "DNT mint of the subdao to be updated",
  },
  name: {
    alias: "n",
    type: "string",
    required: false,
    describe: "The name of the entity config",
  },
  newAuthority: {
    required: false,
    describe: "New subdao authority",
    type: "string",
    default: null,
  },
  newEmissionsSchedulePath: {
    required: false,
    describe: "Path to file that contains the new emissions schedule",
    type: "string",
    default: null,
  },
  newActiveDeviceAggregator: {
    required: false,
    default: null,
    type: "string",
  },
  newDcBurnAuthority: {
    required: false,
    default: null,
    type: "string",
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S",
  },
  councilKey: {
    type: "string",
    describe: "Key of gov council token",
    default: "counKsk72Jgf9b3aqyuQpFf12ktLdJbbuhnoSxxQoMJ",
  },
  executeProposal: {
    type: "boolean",
  },
  switchboardNetwork: {
    type: "string",
    describe: "The switchboard network",
    default: "devnet",
  },
});


async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const wallet = loadKeypair(argv.wallet);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const govProgramId = new PublicKey(argv.govProgramId);
  const councilKey = new PublicKey(argv.councilKey);
  const program = await initHsd(provider);
  const hemProgram = await initHem(provider);
  const cbProgram = await initCb(provider);

  const instructions = [];

  const subDao = subDaoKey(new PublicKey(argv.dntMint))[0];
  const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
  if (argv.newAuthority) {
    if (!argv.name) {
      throw new Error("--name is required")
    }
    // update entity config auth
    const config = rewardableEntityConfigKey(subDao, argv.name.toUpperCase())[0];
    const configAcc = await hemProgram.account.rewardableEntityConfigV0.fetch(config);
    instructions.push(
      await hemProgram.methods
        .updateRewardableEntityConfigV0({
          newAuthority: new PublicKey(argv.newAuthority),
          settings: null,
        })
        .accounts({
          rewardableEntityConfig: config,
          authority: configAcc.authority,
        })
        .instruction()
    );

    // update dnt cb auth
    const dntCircuitBreaker = mintWindowedBreakerKey(subDaoAcc.dntMint)[0];
    const dntCbAcc = await cbProgram.account.mintWindowedCircuitBreakerV0.fetch(dntCircuitBreaker);
    instructions.push(
      await cbProgram.methods.updateMintWindowedBreakerV0({
        newAuthority: new PublicKey(argv.newAuthority),
        config: null,
      }).accounts({
        circuitBreaker: dntCircuitBreaker,
        authority: dntCbAcc.authority,
      }).instruction()
    );

    // update treasury cb auth
    const treasuryCircuitBreaker = accountWindowedBreakerKey(subDaoAcc.treasury)[0];
    const treasuryCbAcc = await cbProgram.account.accountWindowedCircuitBreakerV0.fetch(treasuryCircuitBreaker);
    instructions.push(
      await cbProgram.methods.updateAccountWindowedBreakerV0({
        newAuthority: new PublicKey(argv.newAuthority),
        config: null,
      }).accounts({
        circuitBreaker: treasuryCircuitBreaker,
        authority: treasuryCbAcc.authority,
      }).instruction()
    );

    // update agg auth
    if (!isLocalhost(provider)) {
      const aggKeypair = loadKeypair(
        `${__dirname}/../keypairs/aggregator-${argv.name}.json`
      );
      const switchboard = await SwitchboardProgram.load(
        argv.switchboardNetwork as Cluster,
        provider.connection,
        wallet
      );
      const [agg, aggData] = (await AggregatorAccount.load(switchboard, subDaoAcc.activeDeviceAggregator));
      if (aggData.authority.equals(aggKeypair.publicKey)) {
        instructions.push(
          agg.setAuthorityInstruction(
            provider.wallet.publicKey,
            {newAuthority: new PublicKey(argv.newAuthority), authority: aggKeypair}
          )
        );
      } else {
        instructions.push(
          agg.setAuthorityInstruction(
            aggData.authority, // payer needs to be the same as the old authority
            {newAuthority: new PublicKey(argv.newAuthority)}
          )
        )
      }
    }
  }
  
  instructions.push(
    await program.methods
      .updateSubDaoV0({
        authority: argv.newAuthority ? new PublicKey(argv.newAuthority) : null,
        emissionSchedule: argv.newEmissionsSchedulePath
          ? parseEmissionsSchedule(argv.newEmissionsSchedulePath)
          : null,
        dcBurnAuthority: argv.newDcBurnAuthority
          ? new PublicKey(argv.newDcBurnAuthority)
          : null,
        onboardingDcFee: null,
        activeDeviceAggregator: argv.newActiveDeviceAggregator
          ? new PublicKey(argv.newActiveDeviceAggregator)
          : null,
      })
      .accounts({
        subDao,
        authority: subDaoAcc.authority,
      })
      .instruction()
  );

  await sendInstructionsOrCreateProposal({
    provider,
    instructions,
    walletSigner: wallet,
    govProgramId,
    proposalName: "Update Subdao",
    votingMint: councilKey,
    executeProposal: argv.executeProposal,
  });
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
