import * as anchor from "@coral-xyz/anchor";
import { HplCrons } from "../../target/types/hpl_crons";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  taskKey,
} from "@helium/tuktuk-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";
import { sendInstructions } from "@helium/spl-utils";

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
    index: {
      type: "number",
      alias: "i",
      default: 0,
      describe: "The index of the task to queue",
    },
    taskQueue: {
      required: true,
      type: "string",
      alias: "t",
      describe: "The task queue to queue",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const taskQueue = new PublicKey(argv.taskQueue);
  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  const program = new anchor.Program<HplCrons>(
    idl as HplCrons,
    provider
  ) as anchor.Program<HplCrons>;
  const tuktukProgram = await initTuktuk(provider);

  const instructions: TransactionInstruction[] = [];
  const [task] = taskKey(taskQueue, argv.index);
  const dao = new PublicKey("BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie");
  const iotSubDao = new PublicKey(
    "39Lw1RH6zt8AJvKn3BTxmUDofzduCM2J3kSaGDZ8L7Sk"
  );
  const mobileSubDao = new PublicKey(
    "Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22"
  );
  const [customWallet, bump] = customSignerKey(taskQueue, [
    Buffer.from("helium", "utf-8"),
  ]);
  const bumpBuffer = Buffer.alloc(1);
  bumpBuffer.writeUint8(bump);
  console.log("Using custom wallet", customWallet.toBase58());
  const { transaction, remainingAccounts } = compileTransaction(
    [
      await program.methods
        .queueEndEpoch()
        .accountsStrict({
          payer: customWallet,
          taskReturnAccount: PublicKey.findProgramAddressSync(
            [Buffer.from("task_return_account", "utf-8")],
            PROGRAM_ID
          )[0],
          taskQueue,
          dao,
          iotSubDao,
          mobileSubDao,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    [[Buffer.from("helium", "utf-8"), bumpBuffer]]
  );

  const ixs = [
    await tuktukProgram.methods
      .queueTaskV0({
        id: argv.index,
        trigger: { now: {} },
        crankReward: null,
        freeTasks: 2,
        transaction: {
          compiledV0: [transaction],
        },
      })
      .accounts({
        task,
        taskQueue,
      })
      .remainingAccounts(remainingAccounts)
      .instruction(),
  ];

  await sendInstructions(provider, ixs);
}
