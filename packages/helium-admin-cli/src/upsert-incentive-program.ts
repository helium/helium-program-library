import * as anchor from "@coral-xyz/anchor";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { carrierKey, incentiveProgramKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquadsV4 } from "./utils";

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
    carrierName: {
      alias: "c",
      type: "string",
      required: true,
      describe: "The name of the carrier",
    },
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "The name of the incentive program",
    },
    dntMint: {
      type: "string",
      required: true,
      describe: "The subdao mint",
      default: MOBILE_MINT.toBase58(),
    },
    shares: {
      type: "number",
      required: true,
      describe: "The number of rewards shares this program should have",
    },
    startTs: {
      type: "number",
      required: true,
      describe: "The start timestamp of the incentive program in epoch seconds",
    },
    stopTs: {
      type: "number",
      required: true,
      describe: "The start timestamp of the incentive program in epoch seconds",
    },
    metadataUrl: {
      type: "string",
      required: true,
      describe: "The metadata url",
    },
    recipient: {
      type: "string",
      required: true,
      describe: "The recipient of the incentive program NFT",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig for subdao authority. If not provided, your wallet will be the authority",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const carrierName = argv.carrierName;
  const memProgram = await initMem(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const subDao = (await subDaoKey(dntMint))[0];

  const carrier = await carrierKey(subDao, carrierName)[0];
  const carrierAcc = await memProgram.account.carrierV0.fetch(carrier);
  const issuingAuthority = carrierAcc.issuingAuthority;
  const incentiveProgramK = incentiveProgramKey(carrier, argv.name)[0];
  const incentiveProgram = await memProgram.account.incentiveEscrowProgramV0.fetchNullable(incentiveProgramK);

  let instructions: TransactionInstruction[] = []
  if (!incentiveProgram) {
    console.log("Creating incentive program");
    instructions.push(
      await memProgram.methods
        .initializeIncentiveProgramV0({
          metadataUrl: argv.metadataUrl,
          shares: argv.shares,
          startTs: new anchor.BN(argv.startTs),
          stopTs: new anchor.BN(argv.stopTs),
          name: argv.name,
        })
        .accountsPartial({ carrier, recipient: new PublicKey(argv.recipient), issuingAuthority })
        .instruction()
    );
  } else {
    instructions.push(
      await memProgram.methods.updateIncentiveProgramV0({
        startTs: new anchor.BN(argv.startTs),
        stopTs: new anchor.BN(argv.stopTs),
        shares: argv.shares,
      })
      .accountsPartial({
        carrier,
        incentiveEscrowProgram: incentiveProgramK,
        issuingAuthority
      })
      .instruction()
    );
  }

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    signers: [],
    payer: provider.wallet.publicKey,
    commitment: "confirmed",
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
  });
}
