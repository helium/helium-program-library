import * as anchor from "@coral-xyz/anchor";
import {
  daoKey,
  init as initDao,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads } from "./utils";

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
    hntMint: {
      type: "string",
      describe:
        "Mint of the HNT token. Only used if --resetDaoThread flag is set",
    },
    dntMint: {
      type: "string",
      describe:
        "Mint of the subdao token. Only used if --resetSubDaoThread flag is set",
    },
    resetDaoThread: {
      type: "boolean",
      describe: "Reset the dao clockwork thread",
      default: false,
    },
    resetSubDaoThread: {
      type: "boolean",
      describe: "Reset the subdao clockwork thread",
      default: false,
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
  if (argv.resetSubDaoThread && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initDao(provider);
  const instructions: TransactionInstruction[] = [];

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet, {
      commitmentOrConfig: "finalized"
    }
  );
  
  if (argv.resetDaoThread) {
    console.log("resetting dao thread");
    const hntMint = new PublicKey(argv.hntMint!);
    const dao = daoKey(hntMint)[0];
    const daoAcc = await hsdProgram.account.daoV0.fetch(dao);

    instructions.push(
      await hsdProgram.methods
        .resetDaoThreadV0()
        .accounts({
          dao,
          authority: daoAcc.authority,
        })
        .instruction()
    );
  }

  if (argv.resetSubDaoThread) {
    console.log("resetting subdao thread");
    const dntMint = new PublicKey(argv.dntMint!);
    const subDao = subDaoKey(dntMint)[0];
    const subdaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);

    instructions.push(
      await hsdProgram.methods
        .resetSubDaoThreadV0()
        .accounts({
          subDao,
          authority: subdaoAcc.authority,
          threadPayer: subdaoAcc.authority,
        })
        .instruction()
    );
  }

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
