import * as anchor from "@coral-xyz/anchor";
import {
  accountWindowedBreakerKey,
  init as initCb,
  mintWindowedBreakerKey,
} from "@helium/circuit-breaker-sdk";
import {
  init as initHem,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { init as initHsd, subDaoKey, delegatorRewardsPercent } from "@helium/helium-sub-daos-sdk";
import { Cluster, PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import {
  AggregatorAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import { BN } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import {
  isLocalhost,
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquads,
} from "./utils";

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
    executeTransaction: {
      type: "boolean",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
    switchboardNetwork: {
      type: "string",
      describe: "The switchboard network",
      default: "devnet",
    },
    registrar: {
      type: "string",
      required: false,
      describe: "VSR Registrar of subdao",
      default: null,
    },
    delegatorRewardsPercent: {
      type: "number",
      required: false,
      describe:
        "Percentage of rewards allocated to delegators. Must be between 0-100 and can have 8 decimal places.",
      default: null,
    },
    onboardingDataOnlyDcFee: {
      type: "number",
      required: false,
      describe: "The data credits fee for onboarding data only hotspots",
      default: null,
    },
    activeDeviceAuthority: {
      type: "string",
      required: false,
      describe: "The authority that can set hotspot active status",
      default: null,
    }
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const wallet = loadKeypair(argv.wallet);
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await initHsd(provider);
  const hemProgram = await initHem(provider);
  const cbProgram = await initCb(provider);

  const instructions = [];

  const subDao = subDaoKey(new PublicKey(argv.dntMint))[0];
  const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
  if (argv.newAuthority) {
    if (!argv.name) {
      throw new Error("--name is required");
    }
    // update entity config auth
    const config = rewardableEntityConfigKey(
      subDao,
      argv.name.toUpperCase()
    )[0];
    const configAcc = await hemProgram.account.rewardableEntityConfigV0.fetch(
      config
    );
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
    const dntCbAcc = await cbProgram.account.mintWindowedCircuitBreakerV0.fetch(
      dntCircuitBreaker
    );
    instructions.push(
      await cbProgram.methods
        .updateMintWindowedBreakerV0({
          newAuthority: new PublicKey(argv.newAuthority),
          config: null,
        })
        .accounts({
          circuitBreaker: dntCircuitBreaker,
          authority: dntCbAcc.authority,
        })
        .instruction()
    );

    // update treasury cb auth
    const treasuryCircuitBreaker = accountWindowedBreakerKey(
      subDaoAcc.treasury
    )[0];
    const treasuryCbAcc =
      await cbProgram.account.accountWindowedCircuitBreakerV0.fetch(
        treasuryCircuitBreaker
      );
    instructions.push(
      await cbProgram.methods
        .updateAccountWindowedBreakerV0({
          newAuthority: new PublicKey(argv.newAuthority),
          config: null,
        })
        .accounts({
          circuitBreaker: treasuryCircuitBreaker,
          authority: treasuryCbAcc.authority,
        })
        .instruction()
    );

    // update agg auth
    if (!isLocalhost(provider)) {
      const switchboard = await SwitchboardProgram.load(
        argv.switchboardNetwork as Cluster,
        provider.connection,
        wallet
      );
      const [agg, aggData] = await AggregatorAccount.load(
        switchboard,
        subDaoAcc.activeDeviceAggregator
      );
      if (!aggData.authority.equals(subDaoAcc.activeDeviceAggregator)) {
        instructions.push(
          ...agg.setAuthorityInstruction(
            aggData.authority, // payer needs to be the same as the old authority
            { newAuthority: new PublicKey(argv.newAuthority) }
          ).ixns
        );
      }
    }
  }

  if (argv.delegatorRewardsPercent && (argv.delegatorRewardsPercent > 100 || argv.delegatorRewardsPercent < 0)) {
    throw new Error("Delegator rewards percent must be between 0 and 100");
  }

  instructions.push(
    await program.methods
      .updateSubDaoV0({
        authority: argv.newAuthority ? new PublicKey(argv.newAuthority) : null,
        emissionSchedule: argv.newEmissionsSchedulePath
          ? await parseEmissionsSchedule(argv.newEmissionsSchedulePath)
          : null,
        dcBurnAuthority: argv.newDcBurnAuthority
          ? new PublicKey(argv.newDcBurnAuthority)
          : null,
        onboardingDcFee: null,
        onboardingDataOnlyDcFee: argv.onboardingDataOnlyDcFee ? new BN(argv.onboardingDataOnlyDcFee) : null,
        activeDeviceAggregator: argv.newActiveDeviceAggregator
          ? new PublicKey(argv.newActiveDeviceAggregator)
          : null,
        registrar: argv.registrar ? new PublicKey(argv.registrar) : null,
        delegatorRewardsPercent: argv.delegatorRewardsPercent ? delegatorRewardsPercent(argv.delegatorRewardsPercent) : null,
        activeDeviceAuthority: argv.activeDeviceAuthority ? new PublicKey(argv.activeDeviceAuthority) : null,
      })
      .accounts({
        subDao,
        authority: subDaoAcc.authority,
        payer: subDaoAcc.authority,
      })
      .instruction()
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet, {
      commitmentOrConfig: "finalized"
    }
  );
  await sendInstructionsOrSquads({
    provider,
    instructions,
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
