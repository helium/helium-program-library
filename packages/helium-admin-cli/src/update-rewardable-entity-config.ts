import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquads } from "./utils";
import BN from "bn.js";
import { getMint } from "@solana/spl-token";
import { toBN } from "@helium/spl-utils";

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
      describe: "Public Key of the subdao mint",
      type: "string",
    },
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "The name of the entity config",
    },
    newAuthority: {
      type: "string",
      describe: "The new authority for the entity config",
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
    fullLocationStakingFee: {
      type: "number",
      describe: "The full hotspot location assert fee",
      default: "1000000",
    },
    dataonlyLocationStakingFee: {
      type: "number",
      describe: "The full hotspot location assert fee",
      default: "1000000",
    },
    stakingRequirement: {
      type: "number",
      describe:
        "The staking requirement for the entity, numeric. Decimals will be added automatically",
    },
    cbrsDcOnboardingFee: {
      type: 'number',
      describe: 'The cbrs dc onboarding fee',
    },
    cbrsDcLocationStakingFee: {
      type: 'number',
      describe: 'The cbrs dc location staking fee',
    },
    wifiDcOnboardingFee: {
      type: 'number',
      describe: 'The wifi dc onboarding fee',
    },
    wifiDcLocationStakingFee: {
      type: 'number',
      describe: 'The wifi dc location staking fee',
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const name = argv.name;
  const hemProgram = await initHem(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const subdao = (await subDaoKey(dntMint))[0];
  const dntMintAcc = await getMint(provider.connection, dntMint);
  const rewardableConfigKey = (
    await rewardableEntityConfigKey(subdao, name.toUpperCase())
  )[0];
  const rewardableConfigAcc =
    await hemProgram.account.rewardableEntityConfigV0.fetch(
      rewardableConfigKey
    );
  let payer = provider.wallet.publicKey;
  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });

  let settings;
  if (name.toUpperCase() == "IOT") {
    settings = {
      iotConfig: {
        minGain: 10,
        maxGain: 150,
        fullLocationStakingFee: new BN(argv.fullLocationStakingFee),
        dataonlyLocationStakingFee: new BN(argv.dataonlyLocationStakingFee),
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
            dcOnboardingFee: toBN(20, 5),
            locationStakingFee: toBN(0, 5),
            mobileOnboardingFeeUsd: toBN(0, 6),
            reserved: new Array(8).fill(new BN(0)),
          },
          {
            deviceType: { wifiOutdoor: {} },
            dcOnboardingFee: toBN(30, 5),
            locationStakingFee: toBN(0, 5),
            mobileOnboardingFeeUsd: toBN(0, 6),
            reserved: new Array(8).fill(new BN(0)),
          },
          {
            deviceType: { wifiDataOnly: {} },
            dcOnboardingFee: toBN(2, 5),
            locationStakingFee: toBN(0, 5),
            mobileOnboardingFeeUsd: toBN(0, 6),
            reserved: new Array(8).fill(new BN(0)),
          },
        ],
      },
    };
  }

  const instructions = [
    await hemProgram.methods
      .updateRewardableEntityConfigV0({
        settings,
        newAuthority: argv.newAuthority ? new PublicKey(argv.newAuthority) : null,
        stakingRequirement: argv.stakingRequirement
          ? toBN(argv.stakingRequirement, dntMintAcc.decimals)
          : new BN(0),
      })
      .accountsPartial({
        rewardableEntityConfig: rewardableConfigKey,
        authority: rewardableConfigAcc.authority,
        payer: rewardableConfigAcc.authority,
      })
      .instruction(),
  ];

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
