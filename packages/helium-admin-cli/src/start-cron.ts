import * as anchor from "@coral-xyz/anchor";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
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
import { init as initHplCrons, epochTrackerKey, taskReturnAccountKey } from "@helium/hpl-crons-sdk";

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
    epoch: {
      optional: true,
      type: "number",
      describe: "The epoch to set",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const taskQueue = new PublicKey(argv.taskQueue);
  const program = await initHplCrons(provider);
  const tuktukProgram = await initTuktuk(provider);

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
  const [epochTracker, etBumpSeed] = epochTrackerKey(dao);
  let ixs: TransactionInstruction[] = [];
  if (argv.epoch) {
    ixs.push(
      await program.methods
        .updateEpochTracker({
          epoch: new anchor.BN(argv.epoch),
          authority: provider.wallet.publicKey,
        })
        .accountsStrict({
          authority: provider.wallet.publicKey,
          epochTracker,
        })
        .instruction()
    );
  }
  if (!(await provider.connection.getAccountInfo(epochTracker))) {
    ixs.push(
      await program.methods
        .initEpochTracker()
        .accountsPartial({
          dao,
          authority: provider.wallet.publicKey,
        })
        .instruction()
    );
  }
  const epochTrackerAcc = await program.account.epochTrackerV0.fetch(epochTracker);
  const { transaction, remainingAccounts } = compileTransaction(
    [
      await program.methods
        .queueEndEpoch()
        .accountsStrict({
          payer: customWallet,
          taskReturnAccount: taskReturnAccountKey()[0],
          epochTracker: epochTrackerKey(dao)[0],
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

  ixs.push(
    await tuktukProgram.methods
      .queueTaskV0({
        id: argv.index,
        trigger: { now: {} },
        crankReward: null,
        freeTasks: 2,
        transaction: {
          compiledV0: [transaction],
        },
        description: `queue end epoch ${epochTrackerAcc.epoch}`,
      })
      .accountsPartial({
        task,
        taskQueue,
      })
      .remainingAccounts(remainingAccounts)
      .instruction()
  );

  await sendInstructionsWithPriorityFee(provider, ixs);
}
