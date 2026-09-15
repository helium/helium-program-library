import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { sendInstructions } from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  runTask,
  taskKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { init as initHsd } from "../packages/helium-sub-daos-sdk/src";
import {
  epochTrackerKey,
  init as initHplCrons,
  taskReturnAccountKey,
} from "../packages/hpl-crons-sdk/src";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { HplCrons } from "../target/types/hpl_crons";
import { initTestDao, initTestSubdao } from "./utils/daos";

describe("hpl-crons", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const tuktukConfig: PublicKey = tuktukConfigKey()[0];
  const taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`;

  let program: Program<HplCrons>;
  let hsdProgram: Program<HeliumSubDaos>;
  let tuktukProgram: Program<Tuktuk>;
  let taskQueue: PublicKey;
  let dao: PublicKey;
  let iotSubDao: PublicKey;
  let mobileSubDao: PublicKey;

  before(async () => {
    program = await initHplCrons(
      provider,
      anchor.workspace.HplCrons.programId,
      anchor.workspace.HplCrons.idl
    );
    hsdProgram = await initHsd(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );
    tuktukProgram = await initTuktuk(provider);

    const config = await tuktukProgram.account.tuktukConfigV0.fetch(
      tuktukConfig
    );
    taskQueue = taskQueueKey(tuktukConfig, config.nextTaskQueueId)[0];
    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: taskQueueName,
        minCrankReward: new anchor.BN(1),
        capacity: 100,
        lookupTables: [],
        staleTaskAge: 10000,
      })
      .accounts({
        tuktukConfig,
        payer: me,
        updateAuthority: me,
        taskQueue,
        taskQueueNameMapping: taskQueueNameMappingKey(
          tuktukConfig,
          taskQueueName
        )[0],
      })
      .rpc();

    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        payer: me,
        queueAuthority: me,
        taskQueue,
      })
      .rpc();

    ({ dao } = await initTestDao(hsdProgram, provider, 100, me));
    ({ subDao: iotSubDao } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
    }));
    ({ subDao: mobileSubDao } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
    }));

    await program.methods
      .initEpochTracker()
      .accounts({
        payer: me,
        dao,
        authority: me,
        taskQueue,
      })
      .rpc({ skipPreflight: true });
  });

  // Regression test for the mainnet outage where queue_end_epoch blew the 32KB
  // SBF heap ("memory allocation failed, out of memory") while serializing the
  // two compiled return transactions. Mirrors the production flow exactly:
  // start-cron.ts queues the bootstrap task, then a crank turner runs it.
  // Compiles queue_end_epoch under `queue`'s custom "helium" signer, which pays the task
  // return account's rent, and queues it as task `taskId` on that queue.
  const queueEndEpochTask = async ({
    queue,
    taskId,
    description,
  }: {
    queue: PublicKey;
    taskId: number;
    description: string;
  }) => {
    const [payer, bump] = customSignerKey(queue, [
      Buffer.from("helium", "utf-8"),
    ]);
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: payer,
        lamports: 1000000000,
      }),
    ]);
    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);
    const { transaction, remainingAccounts } = compileTransaction(
      [
        await program.methods
          .queueEndEpoch()
          .accountsStrict({
            payer,
            taskReturnAccount: taskReturnAccountKey()[0],
            epochTracker: epochTrackerKey(dao)[0],
            taskQueue: queue,
            dao,
            iotSubDao,
            mobileSubDao,
            hntPriceOracle: me,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      ],
      [[Buffer.from("helium", "utf-8"), bumpBuffer]]
    );
    const task = taskKey(queue, taskId)[0];
    await tuktukProgram.methods
      .queueTaskV0({
        id: taskId,
        trigger: { now: {} },
        crankReward: null,
        freeTasks: 2,
        transaction: { compiledV0: [transaction] },
        description,
      })
      .accountsPartial({ task, taskQueue: queue })
      .remainingAccounts(remainingAccounts)
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    return task;
  };

  // Simulates running `task`. The simulation returns the program's own log line, which names
  // the error, where a failed send reports only that the transaction failed; the node supplies
  // the blockhash, so the simulation cannot fail before the program runs and leave the
  // assertion reading an empty log.
  const simulateRunTask = async (task: PublicKey) => {
    const message = new TransactionMessage({
      payerKey: me,
      recentBlockhash: (await provider.connection.getLatestBlockhash())
        .blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ...(await runTask({
          program: tuktukProgram,
          task,
          crankTurner: me,
        })),
      ],
    }).compileToV0Message();
    return provider.connection.simulateTransaction(
      new VersionedTransaction(message),
      { commitment: "confirmed", replaceRecentBlockhash: true }
    );
  };

  it("runs queue_end_epoch through tuktuk without exhausting the heap", async () => {
    const [epochTracker] = epochTrackerKey(dao);
    const epochBefore = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;
    const task = await queueEndEpochTask({
      queue: taskQueue,
      taskId: 0,
      description: `queue end epoch ${epochBefore.add(new anchor.BN(1))}`,
    });

    // This is the step that OOMed on mainnet: RunTaskV0 CPIs into
    // queue_end_epoch, which compiles the 5-instruction end-epoch transaction
    // plus its own reschedule and writes both into the task return account.
    const sig = await sendInstructions(provider, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ...(await runTask({
        program: tuktukProgram,
        task,
        crankTurner: me,
      })),
    ]);

    // queue_end_epoch trades allocation for computation: it dedupes and indexes accounts by
    // linear scan rather than by hashing, because the 32KB heap is the scarcer budget and a
    // bump allocator never reclaims what a HashMap's growth chain leaves behind. That trade is
    // only safe while the compute side stays clear of its own ceiling, so measure it here
    // rather than reasoning about it: the crank turner sets the limit, and a regression that
    // pushes past it fails the epoch exactly as an overflow would.
    // A confirmed signature is not immediately queryable on a busy RPC, so getTransaction can
    // return null for a transaction that landed. Retry, or this measures RPC timing rather than
    // compute and fails as a flake instead of as a regression.
    let executed: Awaited<
      ReturnType<typeof provider.connection.getTransaction>
    > = null;
    for (let i = 0; i < 10 && !executed; i++) {
      executed = await provider.connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 1,
      });
      if (!executed) await new Promise((r) => setTimeout(r, 500));
    }
    const consumed = executed?.meta?.computeUnitsConsumed;
    console.log(`    queue_end_epoch consumed ${consumed} compute units`);
    expect(consumed, "compute units should be reported").to.be.a("number");
    expect(
      consumed!,
      "queue_end_epoch compute has regressed; the linear scans that keep the heap down are the " +
        "likely cause, and the crank turner's limit is what this has to stay under"
    ).to.be.lessThan(900000);

    const epochAfter = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;
    expect(epochAfter.toString()).to.equal(
      epochBefore.add(new anchor.BN(1)).toString()
    );
  });

  // The epoch tracker names the one task queue whose tasks advance its epoch. The payer PDA is
  // seeded by whichever queue the instruction is passed, so the tracker's own field is what
  // decides which queue that is.
  it("rejects queue_end_epoch driven by a task queue the tracker does not name", async () => {
    const config = await tuktukProgram.account.tuktukConfigV0.fetch(
      tuktukConfig
    );
    const otherName = `other-${Math.random().toString(36).substring(2, 15)}`;
    const otherQueue = taskQueueKey(tuktukConfig, config.nextTaskQueueId)[0];
    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: otherName,
        minCrankReward: new anchor.BN(1),
        capacity: 100,
        lookupTables: [],
        staleTaskAge: 10000,
      })
      .accounts({
        tuktukConfig,
        payer: me,
        updateAuthority: me,
        taskQueue: otherQueue,
        taskQueueNameMapping: taskQueueNameMappingKey(
          tuktukConfig,
          otherName
        )[0],
      })
      .rpc();
    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({ payer: me, queueAuthority: me, taskQueue: otherQueue })
      .rpc();

    const [epochTracker] = epochTrackerKey(dao);
    const otherTask = await queueEndEpochTask({
      queue: otherQueue,
      taskId: 0,
      description: "queue end epoch from an unnamed queue",
    });

    const epochBefore = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;

    const sim = await simulateRunTask(otherTask);
    expect(sim.value.err, "a task from a queue the tracker does not name must not run").to.not.be
      .null;
    expect((sim.value.logs ?? []).join("\n")).to.include("InvalidTaskQueue");

    const epochAfter = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;
    expect(epochAfter.toString()).to.equal(epochBefore.toString());
  });

  // A tracker whose task_queue is the default key names no queue, so nothing advances its epoch
  // until update_epoch_tracker points it at a live one. Setting it is what re-arms the cron.
  it("runs queue_end_epoch again once the tracker names the live queue", async () => {
    const [epochTracker] = epochTrackerKey(dao);

    await program.methods
      .updateEpochTracker({
        epoch: null,
        authority: null,
        taskQueue: PublicKey.default,
      })
      .accountsStrict({
        authority: me,
        epochTracker,
      })
      .rpc();

    const task = await queueEndEpochTask({
      queue: taskQueue,
      taskId: 50,
      description: "queue end epoch across a queue change",
    });

    const epochBefore = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;

    const sim = await simulateRunTask(task);
    expect(sim.value.err, "the tracker names no queue, so the task must not run").to.not.be
      .null;
    expect((sim.value.logs ?? []).join("\n")).to.include("InvalidTaskQueue");
    expect(
      (await program.account.epochTrackerV0.fetch(epochTracker)).epoch.toString()
    ).to.equal(epochBefore.toString());

    await program.methods
      .updateEpochTracker({
        epoch: null,
        authority: null,
        taskQueue,
      })
      .accountsStrict({
        authority: me,
        epochTracker,
      })
      .rpc();

    await sendInstructions(provider, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ...(await runTask({
        program: tuktukProgram,
        task,
        crankTurner: me,
      })),
    ]);

    const epochAfter = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;
    expect(epochAfter.toString()).to.equal(
      epochBefore.add(new anchor.BN(1)).toString()
    );
  });

  // A pyth verification chain advances one step at a time, so the task it hands back carries a
  // fixed spawn budget rather than a caller-chosen one.
  describe("return_pyth_task_v0", () => {
    const taskId = 20;
    let task: PublicKey;

    before(async () => {
      const [customWallet] = customSignerKey(taskQueue, [
        Buffer.from("pyth", "utf-8"),
      ]);

      task = taskKey(taskQueue, taskId)[0];
      await tuktukProgram.methods
        .queueTaskV0({
          id: taskId,
          trigger: { now: {} },
          crankReward: null,
          freeTasks: 1,
          transaction: {
            remoteV0: { url: "https://example.com/pyth", signer: customWallet },
          },
          description: "pyth bounds",
        })
        .accountsPartial({ task, taskQueue })
        .rpc({ skipPreflight: true });
    });

    async function returnPythTask(freeTasks: number) {
      let code: string | undefined;
      try {
        await program.methods
          .returnPythTaskV0({ index: 0, freeTasks })
          .accountsPartial({ task, taskQueue, payer: me })
          .rpc();
      } catch (e: any) {
        code = e?.error?.errorCode?.code;
        // Anything without an anchor error code is an infra failure, not a program verdict.
        if (!code) throw e;
      }
      return code;
    }

    it("rejects a free task count above the bound", async () => {
      expect(await returnPythTask(2)).to.eq("TooManyFreeTasks");
    });

    // The pyth service always requeues with a single free task; guard the accept side of the
    // bound so an off-by-one in MAX_FREE_TASKS can't slip past CI.
    it("accepts a free task count at the bound", async () => {
      expect(await returnPythTask(1)).to.be.undefined;
    });
  });
});
