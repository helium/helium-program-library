import * as anchor from "@coral-xyz/anchor";
import { batchParallelInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  customSignerKey,
  init as initTuktuk,
  taskKey,
  taskQueueAuthorityKey,
} from "@helium/tuktuk-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { HplCrons } from "@helium/idls/lib/types/hpl_crons";
import { nextAvailableTaskIds } from "@helium/tuktuk-sdk";

const PROGRAM_ID = new PublicKey("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");

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
    taskQueue: {
      required: true,
      type: "string",
      alias: "t",
      describe: "The task queue to queue",
      default: "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
    },
    walletToClaim: {
      type: "string",
      alias: "w",
      describe: "The wallet to claim",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const taskQueue = new PublicKey(argv.taskQueue);
  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  const program = new anchor.Program<HplCrons>(
    idl as HplCrons,
    provider
  ) as anchor.Program<HplCrons>;
  const tuktukProgram = await initTuktuk(provider);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const instructions: TransactionInstruction[] = [];
  const task1 = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)[0];
  const queueAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority")],
    PROGRAM_ID
  )[0];
  const walletToClaim = argv.walletToClaim
    ? new PublicKey(argv.walletToClaim)
    : provider.wallet.publicKey;
  instructions.push(
    await program.methods
      .queueWalletClaimV0({
        freeTaskId: task1,
      })
      .accountsStrict({
        task: taskKey(taskQueue, task1)[0],
        wallet: walletToClaim,
        taskQueue,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        queueAuthority,
        tuktukProgram: tuktukProgram.programId,
        pdaWallet: customSignerKey(taskQueue, [
          Buffer.from("claim_payer"),
          walletToClaim.toBuffer(),
        ])[0],
        taskQueueAuthority: taskQueueAuthorityKey(taskQueue, queueAuthority)[0],
      })
      .instruction()
  );

  await batchParallelInstructionsWithPriorityFee(provider, instructions, {
    onProgress: console.log,
  });
}
