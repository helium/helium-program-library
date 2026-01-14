import * as anchor from "@coral-xyz/anchor";
import { delegatedDataCreditsKey } from "@helium/data-credits-sdk";
import {
  autoTopOffKey,
  init as initDcAutoTopoff,
} from "@helium/dc-auto-top-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { DC_MINT, HNT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
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
    hntMint: {
      type: "string",
      describe: "Pubkey of the HNT token",
      default: HNT_MINT.toBase58(),
    },
    dcMint: {
      type: "string",
      describe: "Pubkey of the Data Credit token",
      default: DC_MINT.toBase58(),
    },
    routerKey: {
      type: "string",
      describe: "The router key for the delegated data credits",
      required: true,
    },
    subDaoMint: {
      type: "string",
      describe: "The sub dao mint for the delegated data credits",
      default: MOBILE_MINT.toBase58(),
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
  const subDaoMint = new PublicKey(argv.subDaoMint);
  const subDao = subDaoKey(subDaoMint)[0];
  const dcMint = new PublicKey(argv.dcMint);

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dcAutoTopoffProgram = await initDcAutoTopoff(provider);

  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  let authority = multisigPda
    ? multisig.getVaultPda({ multisigPda, index: 0 })[0]
    : provider.wallet.publicKey;

  const routerKey = argv.routerKey;
  const delegatedDc = delegatedDataCreditsKey(subDao, routerKey)[0];
  const autoTopOff = autoTopOffKey(delegatedDc, authority)[0];
  const createDcAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    authority,
    getAssociatedTokenAddressSync(dcMint, authority, true),
    authority,
    dcMint
  );
  const closeIx = await dcAutoTopoffProgram.methods
    .closeAutoTopOffV0()
    .accountsPartial({
      autoTopOff,
      rentRefund: authority,
      authority,
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [createDcAtaIx, closeIx],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
