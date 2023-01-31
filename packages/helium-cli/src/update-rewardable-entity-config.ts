import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import {
  init as initHem,
  makerKey,
  rewardableEntityConfigKey,
  makerApprovalKey,
} from "@helium/helium-entity-manager-sdk";
import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { humanReadable, sendInstructions, toBN, truthy } from "@helium/spl-utils";
import * as anchor from "@coral-xyz/anchor";
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import { exists, loadKeypair, sendInstructionsOrCreateProposal } from "./utils";

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
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "hgovTx6UB2QovqMvVuRXsgLsDw8xcS9R3BeWMjR5hgC",
  },
  councilPubkey: {
    type: "string",
    describe: "Pubkey of gov council",
    requred: false
  },
});

async function run() {
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
  const govProgramId = new PublicKey(argv.govProgramId);
  const rewardableConfigAcc = await hemProgram.account.rewardableEntityConfigV0.fetch(rewardableConfigKey);
  const authorityAcc = await provider.connection.getAccountInfo(
    rewardableConfigAcc.authority
  );
  let payer = provider.wallet.publicKey;
  const isGov = authorityAcc != null && authorityAcc.owner.equals(govProgramId);

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
    await hemProgram.methods.updateRewardableEntityConfigV0({
      settings,
      newAuthority: rewardableConfigAcc.authority,
    }).accounts({
      rewardableEntityConfig: rewardableConfigKey,
    })
    .instruction(),
  ];

  if (isGov) {
    const instrs = instructions;
    await sendInstructionsOrCreateProposal({
      provider,
      instructions: instrs,
      walletSigner: wallet,
      signers: [],
      govProgramId,
      proposalName: `Create Makers`,
      votingMint: new PublicKey(argv.councilPubkey)
    });
  } else {
    await sendInstructions(provider, instructions, []);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
