import * as anchor from "@anchor-lang/core";
import { delegatedDataCreditsKey } from "@helium/data-credits-sdk";
import {
  autoTopOffKey,
  init as initDcAutoTopoff,
} from "@helium/dc-auto-top-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import { taskQueueAuthorityKey } from "@helium/tuktuk-sdk";
import {
  init as initTuktukDca,
  queueAuthorityKey,
} from "@helium/tuktuk-dca-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
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
    dca: {
      type: "string",
      describe:
        "The DCA to close. Defaults to the one the auto topoff is currently feeding",
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
  const dcAutoTopoffProgram = await initDcAutoTopoff(provider);
  const tuktukDcaProgram = await initTuktukDca(provider);

  const multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  const authority = multisigPda
    ? multisig.getVaultPda({ multisigPda, index: 0 })[0]
    : provider.wallet.publicKey;

  const subDao = subDaoKey(new PublicKey(argv.subDaoMint))[0];
  const delegatedDc = delegatedDataCreditsKey(subDao, argv.routerKey)[0];
  const autoTopOff = autoTopOffKey(delegatedDc, authority)[0];
  const autoTopOffAcc =
    await dcAutoTopoffProgram.account.autoTopOffV0.fetch(autoTopOff);

  const dca = argv.dca ? new PublicKey(argv.dca) : autoTopOffAcc.dca;
  const dcaAcc = await tuktukDcaProgram.account.dcaV0.fetch(dca);
  const queueAuthority = queueAuthorityKey()[0];

  const closeIx = await dcAutoTopoffProgram.methods
    .closeDcaV0()
    .accountsPartial({
      authority,
      autoTopOff,
      dca,
      dcaMint: dcaAcc.inputMint,
      dcaInputAccount: getAssociatedTokenAddressSync(
        dcaAcc.inputMint,
        dca,
        true
      ),
      dcaMintAccount: autoTopOffAcc.dcaMintAccount,
      queueAuthority,
      taskQueueAuthority: taskQueueAuthorityKey(
        dcaAcc.taskQueue,
        queueAuthority
      )[0],
      rentRefund: dcaAcc.rentRefund,
      taskQueue: dcaAcc.taskQueue,
      nextTask: dcaAcc.nextTask,
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [closeIx],
    multisig: multisigPda ?? undefined,
    signers: [],
  });
}
