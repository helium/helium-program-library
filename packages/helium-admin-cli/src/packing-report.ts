import * as anchor from "@anchor-lang/core";
import {
  epochTrackerKey,
  init as initHplCrons,
  TASK_QUEUE_ID,
} from "@helium/hpl-crons-sdk";
import { init as initMfan } from "@helium/mini-fanout-sdk";
import {
  DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
  getAddressLookupTableAccounts,
  HELIUM_COMMON_LUT,
  HNT_PYTH_PRICE_FEED,
  packInstructionGroups,
  setLoadedAccountsDataSizeLimit,
  toVersionedTx,
  TransactionDraft,
} from "@helium/spl-utils";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import yargs from "yargs/yargs";

// Offline packing report: builds real workloads, packs them per version
// mode with the batcher's packer and prints the result. Never signs or sends.
export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url (surfpool mainnet fork)",
    },
    listUrl: {
      default: "https://solana-rpc.web.helium.io",
      describe:
        "RPC used only to list program accounts; a fork's getProgramAccounts returns only accounts it already loaded",
    },
    payer: {
      default: "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW",
      describe: "Fee payer of the bulk operation",
    },
    taskQueue: {
      default: "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
      describe: "Task queue of the end-epoch requeue",
    },
  });
  const argv = await yarg.argv;
  const connection = new Connection(argv.url, "confirmed");
  const readOnlyWallet = (publicKey: PublicKey) =>
    ({
      publicKey,
      signTransaction: () => {
        throw new Error("packing report never signs");
      },
      signAllTransactions: () => {
        throw new Error("packing report never signs");
      },
    } as any);
  const providerFor = (url: string, publicKey: PublicKey) =>
    new anchor.AnchorProvider(
      new Connection(url, "confirmed"),
      readOnlyWallet(publicKey),
      {}
    );
  const { blockhash } = await connection.getLatestBlockhash();
  const [commonLut] = await getAddressLookupTableAccounts(connection, [
    HELIUM_COMMON_LUT,
  ]);

  console.log(`fork: ${argv.url}`);
  console.log(`account listing: ${argv.listUrl} (fork gPA is empty)`);
  console.log(`v0+LUT mode LUT: ${HELIUM_COMMON_LUT.toBase58()}`);
  console.log(
    "unique accounts/tx: payer + program ids + ix keys of the tx as compiled " +
      "(v1 moves ComputeBudget limit/price/heap/data-size ixs into its header)"
  );

  const endEpoch = await endEpochRequeue(
    providerFor,
    argv.url,
    new PublicKey(argv.taskQueue)
  );
  const bulk = await rescheduleMiniFanouts(
    providerFor,
    argv.url,
    argv.listUrl,
    new PublicKey(argv.payer)
  );

  for (const workload of [endEpoch, bulk]) {
    console.log(
      `\n${workload.name}: ${workload.groups.length} groups, ` +
        `${workload.groups.flat().length} ixs, payer ${workload.payer.toBase58()}`
    );
    for (const mode of [
      { name: "v1", versions: [1] as (0 | 1)[], luts: [] },
      { name: "v0+LUT", versions: [0] as (0 | 1)[], luts: [commonLut] },
      { name: "selected (v1, v0+LUT)", versions: [1, 0] as (0 | 1)[], luts: [commonLut] },
    ]) {
      const toProbe = (
        chunk: TransactionInstruction[],
        version: 0 | 1
      ): TransactionDraft =>
        probeDraft({
          chunk,
          version,
          payer: workload.payer,
          blockhash,
          computeUnitLimit: workload.computeUnitLimit,
          luts: version === 0 ? mode.luts : [],
        });
      const chunks = await packInstructionGroups({
        groups: workload.groups,
        versions: mode.versions,
        toProbe,
      });
      const sizes = await Promise.all(
        chunks.map(
          async ({ instructions, version }) =>
            (await toVersionedTx(toProbe(instructions, version))).serialize()
              .length
        )
      );
      const accounts = chunks.map(({ instructions, version }) =>
        uniqueAccounts(
          workload.payer,
          toProbe(instructions, version).instructions,
          version
        )
      );
      const mean = (xs: number[]) =>
        (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
      const v1Count = chunks.filter((c) => c.version === 1).length;
      console.log(
        `  ${mode.name.padEnd(22)} txs=${chunks.length} ` +
          `(v1=${v1Count}, v0=${chunks.length - v1Count}) ` +
          `mean bytes/tx=${mean(sizes)} mean unique accounts/tx=${mean(
            accounts
          )} ixs/tx=[${chunks.map((c) => c.instructions.length).join(",")}]`
      );
    }
  }
}

// Mirrors batchInstructionsToTxsWithPriorityFee's probe, so the report packs
// with the same placeholder ComputeBudget ixs the batcher sizes against.
function probeDraft({
  chunk,
  version,
  payer,
  blockhash,
  computeUnitLimit,
  luts,
}: {
  chunk: TransactionInstruction[];
  version: 0 | 1;
  payer: PublicKey;
  blockhash: string;
  computeUnitLimit?: number;
  luts: AddressLookupTableAccount[];
}): TransactionDraft {
  return {
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit || 100000,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      setLoadedAccountsDataSizeLimit(DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT),
      ...chunk,
    ],
    addressLookupTableAddresses: luts.map((lut) => lut.key),
    addressLookupTables: luts,
    feePayer: payer,
    recentBlockhash: blockhash,
    version,
  };
}

function uniqueAccounts(
  payer: PublicKey,
  instructions: TransactionInstruction[],
  version: 0 | 1
): number {
  const compiled =
    version === 1
      ? instructions.filter(
          (ix) =>
            !(
              ix.programId.equals(ComputeBudgetProgram.programId) &&
              ix.data[0] >= 1 &&
              ix.data[0] <= 4
            )
        )
      : instructions;
  return new Set([
    payer.toBase58(),
    ...compiled.flatMap((ix) => [
      ix.programId.toBase58(),
      ...ix.keys.map((k) => k.pubkey.toBase58()),
    ]),
  ]).size;
}

type Workload = {
  name: string;
  payer: PublicKey;
  groups: TransactionInstruction[][];
  computeUnitLimit?: number;
};

// start-cron's instructions for the end-epoch requeue, with the tracker's
// authority as the payer that sends them.
async function endEpochRequeue(
  providerFor: (url: string, publicKey: PublicKey) => anchor.AnchorProvider,
  url: string,
  taskQueue: PublicKey
): Promise<Workload> {
  const dao = new PublicKey("BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie");
  const iotSubDao = new PublicKey(
    "39Lw1RH6zt8AJvKn3BTxmUDofzduCM2J3kSaGDZ8L7Sk"
  );
  const mobileSubDao = new PublicKey(
    "Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22"
  );
  const [epochTracker] = epochTrackerKey(dao);
  const tracker = await (
    await initHplCrons(providerFor(url, PublicKey.default))
  ).account.epochTrackerV0.fetch(epochTracker);
  const provider = providerFor(url, tracker.authority);
  const program = await initHplCrons(provider);
  const tuktukProgram = await initTuktuk(provider);
  const queue = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const [index] = nextAvailableTaskIds(
    queue.taskBitmap,
    1,
    false,
    queue.capacity
  );
  const [customWallet, bump] = customSignerKey(taskQueue, [
    Buffer.from("helium", "utf-8"),
  ]);
  const bumpBuffer = Buffer.alloc(1);
  bumpBuffer.writeUint8(bump);

  const ixs: TransactionInstruction[] = [];
  if (!tracker.taskQueue.equals(taskQueue)) {
    ixs.push(
      await program.methods
        .updateEpochTracker({ epoch: null, authority: null, taskQueue })
        .accounts({ epochTracker })
        .instruction()
    );
  }
  // The resolver would fill payer with the provider wallet (it defaults signers
  // before deriving PDAs) and read taskQueue from the fetched tracker, which is
  // the old queue when updateEpochTracker above runs first. Pass both. A
  // variable, not a literal, since the IDL types leave them out of .accounts().
  const queueEndEpochAccounts = {
    payer: customWallet,
    taskQueue,
    dao,
    iotSubDao,
    mobileSubDao,
    hntPriceOracle: HNT_PYTH_PRICE_FEED,
  };
  const { transaction, remainingAccounts } = compileTransaction(
    [
      await program.methods
        .queueEndEpoch()
        .accounts(queueEndEpochAccounts)
        .instruction(),
    ],
    [[Buffer.from("helium", "utf-8"), bumpBuffer]]
  );
  ixs.push(
    await tuktukProgram.methods
      .queueTaskV0({
        id: index,
        trigger: { now: {} },
        crankReward: null,
        freeTasks: 2,
        transaction: { compiledV0: [transaction] },
        description: `queue end epoch ${tracker.epoch}`,
      })
      .accounts({ task: taskKey(taskQueue, index)[0], taskQueue })
      .remainingAccounts(remainingAccounts)
      .instruction()
  );
  // start-cron sends these together in one sendInstructionsWithPriorityFee.
  return {
    name: "end-epoch requeue (start-cron)",
    payer: tracker.authority,
    groups: [ixs],
  };
}

// reschedule-all-mini-fanouts' instructions for its idle fanouts.
async function rescheduleMiniFanouts(
  providerFor: (url: string, publicKey: PublicKey) => anchor.AnchorProvider,
  url: string,
  listUrl: string,
  payer: PublicKey
): Promise<Workload> {
  const provider = providerFor(url, payer);
  const program = await initMfan(provider);
  const tuktukProgram = await initTuktuk(provider);
  const listed = await (
    await initMfan(providerFor(listUrl, payer))
  ).account.miniFanoutV0.all();
  const miniFanouts = listed.map(({ publicKey }) => publicKey);
  const accounts = await program.account.miniFanoutV0.fetchMultiple(
    miniFanouts
  );
  const isIdleSentinel = (miniFanout: PublicKey, task: PublicKey) =>
    task.equals(program.programId) || task.equals(miniFanout);
  const claimed = accounts.flatMap((mf, i) =>
    [mf!.nextTask, mf!.nextPreTask].filter(
      (task) => !isIdleSentinel(miniFanouts[i], task)
    )
  );
  const existing = new Set<string>();
  for (let i = 0; i < claimed.length; i += 100) {
    const chunk = claimed.slice(i, i + 100);
    const infos = await provider.connection.getMultipleAccountsInfo(chunk);
    infos.forEach((info, j) => {
      if (info) {
        existing.add(chunk[j].toBase58());
      }
    });
  }
  const isIdle = (miniFanout: PublicKey, task: PublicKey) =>
    isIdleSentinel(miniFanout, task) || !existing.has(task.toBase58());
  const idle = miniFanouts.filter(
    (mf, i) =>
      isIdle(mf, accounts[i]!.nextTask) && isIdle(mf, accounts[i]!.nextPreTask)
  );
  const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(
    TASK_QUEUE_ID
  );
  const freeTasks = nextAvailableTaskIds(
    taskQueue.taskBitmap,
    idle.length * 2,
    false,
    taskQueue.capacity
  );
  const groups: TransactionInstruction[][] = [];
  for (const miniFanout of idle) {
    const nextTask = freeTasks.pop()!;
    const nextPreTask = freeTasks.pop()!;
    groups.push([
      await program.methods
        .scheduleTaskV0({ taskId: nextTask, preTaskId: nextPreTask })
        .accounts({
          payer,
          miniFanout,
          task: taskKey(TASK_QUEUE_ID, nextTask)[0],
          preTask: taskKey(TASK_QUEUE_ID, nextPreTask)[0],
        })
        .instruction(),
    ]);
  }
  return {
    name: `reschedule-all-mini-fanouts (${idle.length} idle of ${miniFanouts.length})`,
    payer,
    groups,
    computeUnitLimit: 1200000,
  };
}
