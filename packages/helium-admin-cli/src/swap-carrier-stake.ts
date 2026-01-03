import * as anchor from "@coral-xyz/anchor";
import { carrierKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";
import { HNT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

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

  const instructions: TransactionInstruction[] = [];

  const dntMint = new PublicKey(argv.dntMint);
  const subDao = subDaoKey(dntMint)[0];
  const carrier = carrierKey(subDao, argv.name)[0];
  const carrierAcc = await program.account.carrierV0.fetch(carrier);
  const authority = carrierAcc.updateAuthority;

  instructions.push(
    await program.methods
      .swapCarrierStake()
      .accountsPartial({
        carrier,
        updateAuthority: carrierAcc.updateAuthority,
        newStakeSource: getAssociatedTokenAddressSync(
          HNT_MINT,
          authority,
        ),
        originalStakeDestination: getAssociatedTokenAddressSync(
          MOBILE_MINT,
          authority,
        ),
        originalStake: getAssociatedTokenAddressSync(
          MOBILE_MINT,
          carrier,
        ),
        newEscrow: getAssociatedTokenAddressSync(
          HNT_MINT,
          carrier,
        ),
        dntMint: MOBILE_MINT,
        hntMint: HNT_MINT,
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
