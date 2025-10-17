import * as anchor from "@coral-xyz/anchor";
import { init as initHsd, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";

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
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
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
      .adminSetDcOnboardingFeesPaid({
        dcOnboardingFeesPaid: new anchor.BN(argv.dcOnboardingFeesPaid),
      })
      .accountsPartial({
        subDao: subDaoK,
        authority: subDaoAcc.authority,
      })
      .instruction()
  );

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
