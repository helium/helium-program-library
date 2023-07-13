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
import { sendInstructionsOrSquads } from "./utils";
import BN from "bn.js";

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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const name = argv.name;
  const hemProgram = await initHem(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const subdao = (await subDaoKey(dntMint))[0];
  const rewardableConfigKey = (
    await rewardableEntityConfigKey(subdao, name.toUpperCase())
  )[0];
  const rewardableConfigAcc =
    await hemProgram.account.rewardableEntityConfigV0.fetch(
      rewardableConfigKey
    );
  let payer = provider.wallet.publicKey;
  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet, {
      commitmentOrConfig: "finalized"
    }
  );

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
      mobileConfig: {
        fullLocationStakingFee: new BN(argv.fullLocationStakingFee),
        dataonlyLocationStakingFee: new BN(argv.dataonlyLocationStakingFee),
      },
    };
  }

  console.log(settings, rewardableConfigAcc.authority.toBase58());

  const instructions = [
    await hemProgram.methods
      .updateRewardableEntityConfigV0({
        settings,
        newAuthority: null,
      })
      .accounts({
        rewardableEntityConfig: rewardableConfigKey,
        authority: rewardableConfigAcc.authority,
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
