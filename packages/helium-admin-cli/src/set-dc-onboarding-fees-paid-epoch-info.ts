import * as anchor from "@coral-xyz/anchor";
import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
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
    minimumPeriods: {
      type: "number",
      describe: "The new minimum number of periods",
    },
    dcOnboardingFeesPaid: {
      type: "string",
      required: true,
      describe: "The new dc onboarding fees paid",
    },
    dntMint: {
      type: "string",
      describe: "DNT mint of the boost config",
      default: MOBILE_MINT.toBase58(),
    },
    subDaoEpochInfo: {
      type: "string",
      describe: "Sub DAO epoch info account",
      required: true,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hsdProgram = await initHsd(provider);

  const instructions: TransactionInstruction[] = [];

  const dntMint = new PublicKey(argv.dntMint);
  const subDaoK = subDaoKey(dntMint)[0];
  const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDaoK);

  instructions.push(
    await hsdProgram.methods
      .adminSetDcOnboardingFeesPaidEpochInfo({
        dcOnboardingFeesPaid: new anchor.BN(argv.dcOnboardingFeesPaid),
      })
      .accounts({
        subDaoEpochInfo: new PublicKey(argv.subDaoEpochInfo),
        authority: subDaoAcc.authority,
      })
      .instruction()
  );

  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });

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
