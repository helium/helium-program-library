import * as anchor from "@coral-xyz/anchor";
import { init as initHvsr } from "@helium/voter-stake-registry-sdk";
import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads } from "./utils";

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
  delegatedPosition: {
    type: "string",
    describe: "PubKey of the effect position",
    required: true,
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

const run = async () => {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hvsrProgram = await initHvsr(provider);
  const hsdProgram = await initHsd(provider);
  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet
  );
  const instructions = [];

  console.log("repairing genesis epoch info");
  const delegatedPosition = new PublicKey(argv.delegatedPosition);
  const delegatedPositionAcc =
    await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosition);
  const positionAcc = await hvsrProgram.account.positionV0.fetch(
    delegatedPositionAcc.position
  );

  const { genesisEndSubDaoEpochInfo } = await hsdProgram.methods
    .closeDelegationV0()
    .accounts({
      position: delegatedPositionAcc.position,
      subDao: delegatedPositionAcc.subDao,
      positionAuthority: positionAcc.positionUpdateAuthority,
    })
    .pubkeys();

  instructions.push(
    await hsdProgram.methods
      .repairGenesisEndEpochInfoV0()
      .accounts({
        genesisEndSubDaoEpochInfo,
      })
      .instruction()
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
};

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
