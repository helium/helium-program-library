import * as anchor from "@coral-xyz/anchor";
import { HNT_MINT } from "@helium/spl-utils";
import {
  init as initHvsr,
  registrarCollectionKey,
} from "@helium/voter-stake-registry-sdk";
import {
  init as initHsd,
  daoKey,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
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
  isDao: {
    type: "boolean",
    require: true,
  },
  mint: {
    type: "string",
    describe: "Mint of the dao/subDao",
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

  if (!argv.mint) {
    console.log("mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initHsd(provider);
  const hvsrProgram = await initHvsr(provider);
  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet
  );
  const instructions = [];

  console.log("reseting registrar");
  const isDao = argv.isDao;
  const mint = new PublicKey(argv.mint);
  const [dao, daoBump] = isDao ? daoKey(mint) : subDaoKey(mint);
  const daoAcc = await (isDao
    ? hsdProgram.account.daoV0.fetch(dao)
    : hsdProgram.account.subDaoV0.fetch(dao));

  const [collection, collectionBump] = registrarCollectionKey(daoAcc.registrar);

  console.log("collection", collection.toBase58());
  console.log("dao", dao.toBase58());

  instructions.push(
    await hvsrProgram.methods
      .repairRegistrarV0({
        bumpSeed: daoBump,
        collection,
        collectionBumpSeed: collectionBump,
      })
      .accounts({
        registrar: daoAcc.registrar,
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
