import * as anchor from "@coral-xyz/anchor";
import { carrierKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import { subDaoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";
import { MOBILE_MINT } from "@helium/spl-utils";

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
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "Name of the carrier, case sensitive",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    updateAuthority: {
      type: "string",
      describe: "The new update authority to set",
    },
    issuingAuthority: {
      type: "string",
      describe: "The new issuing authority to set",
    },
    hexboostAuthority: {
      type: "string",
      describe: "The new hexboost authority to set",
    },
    dntMint: {
      type: "string",
      describe: "DNT mint of the subdao to approve on",
      default: MOBILE_MINT.toBase58(),
    },
    incentiveEscrowFundBps: {
      type: "number",
      describe: "The new incentive escrow fund bps to set",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await initMem(provider);
  const hsdProgram = await initHsd(provider);

  const instructions: TransactionInstruction[] = [];

  const dntMint = new PublicKey(argv.dntMint);
  const subDao = subDaoKey(dntMint)[0];
  const carrier = carrierKey(subDao, argv.name)[0];
  const carrierAcc = await program.account.carrierV0.fetch(carrier)

  instructions.push(
    await program.methods
      .updateCarrierV0({
        hexboostAuthority: argv.hexboostAuthority
          ? new PublicKey(argv.hexboostAuthority)
          : null,
        issuingAuthority: argv.issuingAuthority
          ? new PublicKey(argv.issuingAuthority)
          : null,
        updateAuthority: argv.updateAuthority
          ? new PublicKey(argv.updateAuthority)
          : null,
        incentiveEscrowFundBps: typeof argv.incentiveEscrowFundBps === "number" ? argv.incentiveEscrowFundBps : null,
      })
      .accountsPartial({
        carrier,
        updateAuthority: carrierAcc.updateAuthority,
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
