import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  rewardableEntityConfigKey
} from "@helium/helium-entity-manager-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { toBN } from "@helium/spl-utils";
import {
  PublicKey
} from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquads } from "./utils";

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
    subdaoMint: {
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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const wallet = loadKeypair(argv.wallet);
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const name = argv.name;
  const hemProgram = await initHem(provider);
  const conn = provider.connection;
  const subdaoMint = new PublicKey(argv.subdaoMint);
  const subdao = (await subDaoKey(subdaoMint))[0];
  const rewardableConfigKey = (
    await rewardableEntityConfigKey(subdao, name.toUpperCase())
  )[0];
  const rewardableConfigAcc = await hemProgram.account.rewardableEntityConfigV0.fetch(rewardableConfigKey);
  let payer = provider.wallet.publicKey;
  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet
  );

  let settings;
  if (name.toUpperCase() == "IOT") {
    settings = {
      iotConfig: {
        minGain: 10,
        maxGain: 150,
        fullLocationStakingFee: toBN(1000000, 0),
        dataonlyLocationStakingFee: toBN(500000, 0),
      } as any,
    };
  } else {
    settings = {
      mobileConfig: {
        fullLocationStakingFee: toBN(1000000, 0),
        dataonlyLocationStakingFee: toBN(500000, 0),
      },
    };
  }
  
  console.log(settings);

  const instructions = [
    await hemProgram.methods
      .updateRewardableEntityConfigV0({
        settings,
        newAuthority: rewardableConfigAcc.authority,
      })
      .accounts({
        rewardableEntityConfig: rewardableConfigKey,
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
