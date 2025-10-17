import * as anchor from "@coral-xyz/anchor";
import { daoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : undefined;

  const hsdProgram = await initHsd(provider);

  const dao = daoKey(HNT_MINT)[0]
  const daoAuth = (await hsdProgram.account.subDaoV0.fetch(dao))
    .authority;
  const instructions = [
    await hsdProgram.methods
      .switchMobileOpsFund()
      .accountsPartial({
        authority: daoAuth,
        payer: daoAuth,
        opsFundHnt: getAssociatedTokenAddressSync(
          daoAuth,
          HNT_MINT
        ),
        opsFundMobile: getAssociatedTokenAddressSync(
          daoAuth,
          MOBILE_MINT
        ),
        dao,
      })
      .instruction(),
  ];

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    signers: [],
    multisig,
  });
}
