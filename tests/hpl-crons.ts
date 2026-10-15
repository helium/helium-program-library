import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  createAtaAndMint,
  createMint,
  sendInstructions,
  toBN,
} from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  nextAvailableTaskIds,
  runTask,
  taskKey,
  taskQueueAuthorityKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import { createMemoInstruction } from "@solana/spl-memo";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  AccountMeta,
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  daoKey,
  delegatedPositionKey,
  init as initHsd,
} from "../packages/helium-sub-daos-sdk/src";
import {
  delegationClaimBotKey,
  epochTrackerKey,
  init as initHplCrons,
  queueAuthorityKey,
  taskRentRefund,
  taskReturnAccountKey,
} from "../packages/hpl-crons-sdk/src";
import { init as initVsrProgram } from "../packages/voter-stake-registry-sdk/src";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { HplCrons } from "../target/types/hpl_crons";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { ensureVSRIdl } from "./utils/fixtures";
import { createPosition, initVotingProposal, initVsr } from "./utils/vsr";

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

  // Regression test for the mainnet outage where queue_end_epoch blew the 32KB
  // SBF heap ("memory allocation failed, out of memory") while serializing the
  // two compiled return transactions. Mirrors the production flow exactly:
  // start-cron.ts queues the bootstrap task, then a crank turner runs it.
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

    const otherTask = await queueEndEpochTask({
      queue: otherQueue,
      taskId: 0,
      description: "queue end epoch from an unnamed queue",
    });

    const sim = await simulateRunTask(otherTask);
    expect(sim.value.err, "a task from a queue the tracker does not name must not run").to.not.be
      .null;
    expect((sim.value.logs ?? []).join("\n")).to.include("InvalidTaskQueue");
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

  describe("queue authority task rent", () => {
    let queueAuthority: PublicKey;
    let nextTaskId = 50;

    const balance = (key: PublicKey) => provider.connection.getBalance(key);
    const rent = (space: number) =>
      provider.connection.getMinimumBalanceForRentExemption(space);
    const fund = (to: PublicKey, lamports: number) =>
      sendInstructions(provider, [
        SystemProgram.transfer({ fromPubkey: me, toPubkey: to, lamports }),
      ]);

    // Queues a task on the first free task id through `queue`, and returns the task account's
    // size and rent_refund.
    const queueTask = async (
      queue: (taskId: number, task: PublicKey) => Promise<unknown>,
    ) => {
      while (
        await provider.connection.getAccountInfo(
          taskKey(taskQueue, nextTaskId)[0],
        )
      )
        nextTaskId++;
      const id = nextTaskId++;
      const task = taskKey(taskQueue, id)[0];
      await queue(id, task);
      const info = await provider.connection.getAccountInfo(task);
      const { rentRefund } = await tuktukProgram.account.taskV0.fetch(task);
      return { space: info!.data.length, rentRefund };
    };

    // Queues three tasks through `queue`, all the same size. The queue authority pays a task's
    // rent exactly when its balance covers that rent plus its own rent-exempt minimum;
    // otherwise the payer pays and the queue authority's balance does not change.
    const expectQueueAuthorityPaysOnlyWhenRentExempt = async (
      queue: (taskId: number, task: PublicKey) => Promise<unknown>,
    ) => {
      const start = await balance(queueAuthority);

      // Below the threshold, the payer pays the rent and is the task's rent_refund.
      const first = await queueTask(queue);
      expect(first.rentRefund.toBase58()).to.eq(me.toBase58());
      expect(await balance(queueAuthority)).to.eq(start);

      const taskRent = await rent(first.space);
      const threshold = taskRent + (await rent(0));

      // One lamport short of covering the task and its own rent-exempt minimum.
      await fund(queueAuthority, threshold - 1 - start);
      const short = await queueTask(queue);
      expect(short.space).to.eq(first.space);
      expect(short.rentRefund.toBase58()).to.eq(me.toBase58());
      expect(await balance(queueAuthority)).to.eq(threshold - 1);

      // Exactly enough: the queue authority pays the rent and keeps its minimum.
      await fund(queueAuthority, 1);
      const covered = await queueTask(queue);
      expect(covered.space).to.eq(first.space);
      expect(covered.rentRefund.toBase58()).to.eq(queueAuthority.toBase58());
      expect(await balance(queueAuthority)).to.eq(await rent(0));
    };

    before(async () => {
      [queueAuthority] = queueAuthorityKey(anchor.workspace.HplCrons.programId);
      await tuktukProgram.methods
        .addQueueAuthorityV0()
        .accounts({ payer: me, queueAuthority, taskQueue })
        .rpc();
    });

    describe("queue_wallet_claim_v0", () => {
      // Use only 44-character addresses, so every claim task has the same size.
      const nextWallet = () => {
        let wallet = Keypair.generate().publicKey;
        while (wallet.toBase58().length !== 44)
          wallet = Keypair.generate().publicKey;
        return wallet;
      };

      it("has the queue authority pay a claim task's rent only when it stays rent exempt", async () => {
        expect(await balance(queueAuthority)).to.eq(0);
        await expectQueueAuthorityPaysOnlyWhenRentExempt((freeTaskId, task) =>
          program.methods
            .queueWalletClaimV0({ freeTaskId })
            .accounts({ payer: me, wallet: nextWallet(), taskQueue, task })
            .rpc({ skipPreflight: true }),
        );
      });
    });

    // The vote tasks read a proxy marker, and a vote marker with the position that voted.
    describe("vote tasks", () => {
      let vsrProgram: Program<VoterStakeRegistry>;
      let proxyMarker: PublicKey;
      let voteMarker: PublicKey;
      let position: PublicKey;

      before(async () => {
        vsrProgram = await initVsrProgram(
          provider,
          anchor.workspace.VoterStakeRegistry.programId,
          anchor.workspace.VoterStakeRegistry.idl,
        );
        const proxyProgram = await initNftProxy(provider);
        const proposalProgram = await initProposal(provider);
        const hntMint = await createMint(provider, 8, me, me);
        await createAtaAndMint(provider, hntMint, toBN(1000, 8));
        const { registrar } = await initVsr(
          vsrProgram,
          proxyProgram,
          provider,
          me,
          hntMint,
          me,
        );
        const { proposalConfig, proposal } = await initVotingProposal(
          proposalProgram,
          registrar,
          me,
        );
        ({ position } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          { lockupPeriods: 200, lockupAmount: 100 },
        ));
        const vote = await vsrProgram.methods
          .voteV0({ choice: 0 })
          .accountsPartial({
            registrar,
            proposal,
            position,
            proposalConfig,
            stateController: me,
            onVoteHook: PublicKey.default,
          })
          .rpcAndKeys({ skipPreflight: true });
        voteMarker = vote.pubkeys.marker!;
        const proxiedVote = await vsrProgram.methods
          .proxiedVoteV1({ choice: 0 })
          .accountsPartial({ proposal, voter: me })
          .rpcAndKeys({ skipPreflight: true });
        proxyMarker = proxiedVote.pubkeys.marker!;
      });

      it("has the queue authority pay a proxy vote task's rent only when it stays rent exempt", async () => {
        await expectQueueAuthorityPaysOnlyWhenRentExempt((freeTaskId, task) =>
          program.methods
            .queueProxyVoteV0({ freeTaskId })
            // The client cannot resolve `voter` from the marker, so it is passed.
            .accountsPartial({
              payer: me,
              voter: me,
              marker: proxyMarker,
              taskQueue,
              task,
            })
            .rpc({ skipPreflight: true }),
        );
      });

      it("has the queue authority pay a relinquish expired vote marker task's rent only when it stays rent exempt", async () => {
        await expectQueueAuthorityPaysOnlyWhenRentExempt((freeTaskId, task) =>
          program.methods
            .queueRelinquishExpiredVoteMarkerV0({
              freeTaskId,
              triggerTs: new anchor.BN(0),
            })
            .accounts({
              payer: me,
              marker: voteMarker,
              position,
              taskQueue,
              task,
            })
            .rpc({ skipPreflight: true }),
        );
      });

      it("has the queue authority pay a relinquish expired proxy vote marker task's rent only when it stays rent exempt", async () => {
        await expectQueueAuthorityPaysOnlyWhenRentExempt((freeTaskId, task) =>
          program.methods
            .queueRelinquishExpiredProxyVoteMarkerV0({
              freeTaskId,
              triggerTs: new anchor.BN(0),
            })
            .accounts({ payer: me, marker: proxyMarker, taskQueue, task })
            .rpc({ skipPreflight: true }),
        );
      });
    });
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

  // Start and close dequeue the bot's next task, and tuktuk closes a task only to the rent
  // refund the task itself names. A task that start queued names start's payer; a task that a
  // run returned names the rent refund of the task that ran, when that task paid all of its
  // rent. The rent_amount of the task that ran caps the rent of all the tasks that one run
  // returns, so a task past the cap names the task queue (helium/tuktuk#115). A rent refund that
  // is no account of the instruction is passed as a writable remaining account.
  describe("delegation claim bot", () => {
    const [queueAuthority] = queueAuthorityKey();

    let vsrProgram: Program<VoterStakeRegistry>;
    let proxyProgram: Program<NftProxy>;
    let hntMint: PublicKey;
    let registrar: PublicKey;
    let subDao: PublicKey;
    let botDao: PublicKey;

    before(async () => {
      vsrProgram = await initVsrProgram(
        provider,
        anchor.workspace.VoterStakeRegistry.programId,
        anchor.workspace.VoterStakeRegistry.idl
      );
      ensureVSRIdl();
      proxyProgram = await initNftProxy(provider);

      hntMint = await createMint(provider, 8, me, me);
      await createAtaAndMint(provider, hntMint, toBN(2000, 8));
      ({ registrar } = await initVsr(
        vsrProgram,
        proxyProgram,
        provider,
        me,
        hntMint,
        daoKey(hntMint)[0]
      ));
      // A delegation records the registrar's current epoch as its last claimed epoch, and the
      // bot's first task is due once the epoch after that one has ended. Three days back makes
      // that task due at once, so a test can run it.
      await vsrProgram.methods
        .setTimeOffsetV0(new anchor.BN(-3 * 60 * 60 * 24))
        .accountsPartial({ registrar })
        .rpc({ skipPreflight: true });
      ({ dao: botDao } = await initTestDao(
        hsdProgram,
        provider,
        100,
        me,
        undefined,
        hntMint,
        registrar
      ));
      ({ subDao } = await initTestSubdao({
        hsdProgram,
        provider,
        authority: me,
        dao: botDao,
        registrar,
      }));

      // An earlier suite of this file may have added the queue authority already.
      const taskQueueAuthority = taskQueueAuthorityKey(
        taskQueue,
        queueAuthority
      )[0];
      if (!(await provider.connection.getAccountInfo(taskQueueAuthority))) {
        await tuktukProgram.methods
          .addQueueAuthorityV0()
          .accounts({ payer: me, queueAuthority, taskQueue })
          .rpc();
      }
      // A run pays the task return account from the queue's "helium" signer, and the rent of
      // the tasks it returns from the task queue.
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: customSignerKey(taskQueue, [
            Buffer.from("helium", "utf-8"),
          ])[0],
          lamports: LAMPORTS_PER_SOL,
        }),
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: taskQueue,
          lamports: LAMPORTS_PER_SOL,
        }),
      ]);
    });

    const lamportsOf = (account: PublicKey) =>
      provider.connection.getBalance(account, "confirmed");

    // What tuktuk leaves in a task: the rent exemption for its data, and its crank reward.
    const lamportsHeldBy = async (task: PublicKey) => {
      const { data } = (await provider.connection.getAccountInfo(
        task,
        "confirmed"
      ))!;
      const { crankReward } = tuktukProgram.coder.accounts.decode(
        "taskV0",
        data
      );
      return (
        (await provider.connection.getMinimumBalanceForRentExemption(
          data.length
        )) + Number(crankReward.toString())
      );
    };

    const fundedKeypair = async () => {
      const keypair = Keypair.generate();
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: keypair.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
      ]);
      return keypair;
    };

    type Bot = {
      delegationClaimBot: PublicKey;
      delegatedPosition: PublicKey;
      position: PublicKey;
      mint: PublicKey;
    };

    const rentRefundMeta = (
      pubkey: PublicKey,
      isWritable = true
    ): AccountMeta => ({ pubkey, isWritable, isSigner: false });

    /** The anchor error name and number of a failed run. */
    const errorOf = async (run: Promise<unknown>) => {
      try {
        await run;
      } catch (e: any) {
        const errorCode = e?.error?.errorCode;
        // Anything without an anchor error code is an infra failure, not a program verdict.
        if (!errorCode) throw e;
        return `${errorCode.code} ${errorCode.number}`;
      }
    };

    /**
     * start_delegation_claim_bot_v1 on the next free task id, with `payer` paying for the new
     * task, or the wallet without one.
     */
    const start = async (
      { delegationClaimBot, delegatedPosition, mint }: Bot,
      payer: Keypair | null,
      remainingAccounts: AccountMeta[] = [],
      overrides: Partial<
        Record<
          "subDao" | "positionAuthority" | "mint" | "positionTokenAccount",
          PublicKey
        >
      > = {}
    ) => {
      const { taskBitmap, capacity } =
        await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      const [taskId] = nextAvailableTaskIds(taskBitmap, 1, false, capacity);
      const task = taskKey(taskQueue, taskId)[0];
      const { nextTask } = await program.account.delegationClaimBotV0.fetch(
        delegationClaimBot
      );
      await program.methods
        .startDelegationClaimBotV1({ taskId })
        .accountsPartial({
          payer: payer?.publicKey ?? me,
          queueAuthority,
          delegationClaimBot,
          taskQueue,
          taskQueueAuthority: taskQueueAuthorityKey(
            taskQueue,
            queueAuthority
          )[0],
          task,
          delegatedPosition,
          subDao,
          dao: botDao,
          hntMint,
          positionAuthority: me,
          mint,
          positionTokenAccount: getAssociatedTokenAddressSync(mint, me),
          delegatorAta: getAssociatedTokenAddressSync(hntMint, me),
          nextTask: nextTask.equals(PublicKey.default) ? task : nextTask,
          rentRefund: me,
          ...overrides,
        })
        .remainingAccounts(remainingAccounts)
        // The instruction derives four addresses, so its compute cost moves with their bumps.
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
        ])
        .signers(payer ? [payer] : [])
        .rpc({ skipPreflight: true, commitment: "confirmed" });
      return task;
    };

    const close = (
      { delegationClaimBot, delegatedPosition, position, mint }: Bot,
      nextTask: PublicKey,
      remainingAccounts: AccountMeta[] = []
    ) =>
      program.methods
        .closeDelegationClaimBotV0()
        .accountsPartial({
          rentRefund: me,
          delegationClaimBot,
          taskQueue,
          delegatedPosition,
          position,
          positionAuthority: me,
          mint,
          positionTokenAccount: getAssociatedTokenAddressSync(mint, me),
          nextTask,
          taskQueueAuthority: taskQueueAuthorityKey(
            taskQueue,
            queueAuthority
          )[0],
          queueAuthority,
        })
        .remainingAccounts(remainingAccounts)
        .rpc({ skipPreflight: true, commitment: "confirmed" });

    /** A delegated position with a claim bot that `payer` started, so its task refunds to `payer`. */
    const startedBot = async () => {
      const { position } = await createPosition(
        vsrProgram,
        provider,
        registrar,
        hntMint,
        { lockupPeriods: 183, lockupAmount: 100 }
      );
      const { mint } = await vsrProgram.account.positionV0.fetch(position);
      await hsdProgram.methods
        .delegateV0()
        .accountsPartial({ position, subDao, positionAuthority: me })
        .rpc({ skipPreflight: true });
      const delegatedPosition = delegatedPositionKey(position)[0];
      const delegationClaimBot = delegationClaimBotKey(
        taskQueue,
        delegatedPosition
      )[0];
      await program.methods
        .initDelegationClaimBotV0()
        .accountsPartial({
          payer: me,
          delegationClaimBot,
          taskQueue,
          delegatedPosition,
          position,
          positionAuthority: me,
          mint,
          positionTokenAccount: getAssociatedTokenAddressSync(mint, me),
        })
        .rpc({ skipPreflight: true });

      const bot: Bot = { delegationClaimBot, delegatedPosition, position, mint };
      const payer = await fundedKeypair();
      const task = await start(bot, payer);
      const taskAcc = await tuktukProgram.account.taskV0.fetch(task);
      expect(taskAcc.rentRefund.toBase58()).to.equal(
        payer.publicKey.toBase58()
      );
      return { bot, payer, task };
    };

    /**
     * Runs the bot's task, which leaves the bot on a task that the run returned. The bot's task
     * pays all of the rent of that task, within the rent_amount cap of the run, so it refunds to
     * `payer`, the rent refund of the task that ran. Past the cap, it would refund to the task
     * queue (helium/tuktuk#115).
     */
    const returnedTask = async (
      { delegationClaimBot }: Bot,
      task: PublicKey,
      payer: PublicKey
    ) => {
      await sendInstructions(provider, [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ...(await runTask({
          program: tuktukProgram,
          task,
          crankTurner: me,
        })),
      ]);
      const { nextTask } = await program.account.delegationClaimBotV0.fetch(
        delegationClaimBot
      );
      expect(nextTask.toBase58()).to.not.equal(task.toBase58());
      const nextTaskAcc = await tuktukProgram.account.taskV0.fetch(nextTask);
      expect(nextTaskAcc.rentRefund.toBase58()).to.equal(payer.toBase58());
      // A task that a run queues names the bot.
      expect(
        nextTaskAcc.transaction.compiledV0![0].accounts.map((a) => a.toBase58())
      ).to.include(delegationClaimBot.toBase58());
      return nextTask;
    };

    /**
     * Queues a memo task at the address the bot records. The transaction of that task does not name
     * the bot. Returns the task's lamports.
     */
    const memoTaskAt = async ({ delegationClaimBot }: Bot, task: PublicKey) => {
      const own = await tuktukProgram.account.taskV0.fetch(task);
      // The task that start queued names the bot.
      expect(
        own.transaction.compiledV0![0].accounts.map((a) => a.toBase58())
      ).to.include(delegationClaimBot.toBase58());
      await tuktukProgram.methods
        .dequeueTaskV0()
        .accountsPartial({ task, taskQueue, rentRefund: own.rentRefund })
        .rpc({ skipPreflight: true, commitment: "confirmed" });
      const { transaction, remainingAccounts } = compileTransaction(
        [createMemoInstruction("memo", [])],
        []
      );
      await tuktukProgram.methods
        .queueTaskV0({
          id: own.id,
          trigger: { now: {} },
          crankReward: null,
          freeTasks: 0,
          transaction: { compiledV0: [transaction] },
          description: "memo",
        })
        .accountsPartial({ task, taskQueue })
        .remainingAccounts(remainingAccounts)
        .rpc({ skipPreflight: true, commitment: "confirmed" });
      return lamportsHeldBy(task);
    };

    // The clients find the remaining account with this helper.
    it("gives the rent refund a task names as a writable remaining account, and none with no task", async () => {
      const { bot, payer, task } = await startedBot();
      const resolve = async (key: PublicKey) =>
        (await taskRentRefund(tuktukProgram, key)).map((meta) => ({
          ...meta,
          pubkey: meta.pubkey.toBase58(),
        }));
      const writable = (pubkey: PublicKey) => [
        { pubkey: pubkey.toBase58(), isWritable: true, isSigner: false },
      ];

      expect(await resolve(task)).to.deep.equal(writable(payer.publicKey));
      // A second payer starts the task that runs, so the returned task names a key that differs
      // from the key of the first task.
      const runPayer = await fundedKeypair();
      const runTask = await start(bot, runPayer, [
        rentRefundMeta(payer.publicKey),
      ]);
      expect(
        await resolve(await returnedTask(bot, runTask, runPayer.publicKey))
      ).to.deep.equal(writable(runPayer.publicKey));
      // Start closed the first task and the run closed the second. A bot that never started
      // stores the default key.
      expect(await resolve(task)).to.deep.equal([]);
      expect(await resolve(runTask)).to.deep.equal([]);
      expect(await resolve(PublicKey.default)).to.deep.equal([]);
    });

    describe("start_delegation_claim_bot_v1", () => {
      it("refunds the replaced task to the payer with no remaining account", async () => {
        const { bot, payer, task } = await startedBot();

        const newTask = await start(bot, payer);

        expect(
          await provider.connection.getAccountInfo(task, "confirmed")
        ).to.equal(null);
        const { nextTask } = await program.account.delegationClaimBotV0.fetch(
          bot.delegationClaimBot
        );
        expect(nextTask.toBase58()).to.equal(newTask.toBase58());
      });

      it("fails when the rent refund of the replaced task is not passed", async () => {
        const { bot, task } = await startedBot();

        expect(await errorOf(start(bot, await fundedKeypair()))).to.eq(
          "RentRefundAccountMissing 6008"
        );
        const { nextTask } = await program.account.delegationClaimBotV0.fetch(
          bot.delegationClaimBot
        );
        expect(nextTask.toBase58()).to.equal(task.toBase58());
      });

      it("fails when the rent refund of the replaced task is a read-only remaining account", async () => {
        const { bot, payer, task } = await startedBot();

        expect(
          await errorOf(
            start(bot, await fundedKeypair(), [
              rentRefundMeta(payer.publicKey, false),
            ])
          )
        ).to.eq("RentRefundAccountNotWritable 6009");
        const { nextTask } = await program.account.delegationClaimBotV0.fetch(
          bot.delegationClaimBot
        );
        expect(nextTask.toBase58()).to.equal(task.toBase58());
      });

      it("refunds the replaced task to a writable remaining account", async () => {
        const { bot, payer, task } = await startedBot();
        const newPayer = await fundedKeypair();
        const taskLamports = await lamportsHeldBy(task);
        expect(await lamportsOf(task)).to.equal(taskLamports);
        const before = await lamportsOf(payer.publicKey);

        const newTask = await start(bot, newPayer, [rentRefundMeta(payer.publicKey)]);

        expect(
          await provider.connection.getAccountInfo(task, "confirmed")
        ).to.equal(null);
        expect(await lamportsOf(payer.publicKey)).to.equal(
          before + taskLamports
        );
        const { nextTask } = await program.account.delegationClaimBotV0.fetch(
          bot.delegationClaimBot
        );
        expect(nextTask.toBase58()).to.equal(newTask.toBase58());
      });

      it("refunds a task that a run returned to the payer of the task that ran", async () => {
        const { bot, payer, task } = await startedBot();
        const returned = await returnedTask(bot, task, payer.publicKey);
        const newPayer = await fundedKeypair();
        const taskLamports = await lamportsHeldBy(returned);
        expect(await lamportsOf(returned)).to.equal(taskLamports);
        const before = await lamportsOf(payer.publicKey);

        const newTask = await start(bot, newPayer, [
          rentRefundMeta(payer.publicKey),
        ]);

        expect(
          await provider.connection.getAccountInfo(returned, "confirmed")
        ).to.equal(null);
        expect(await lamportsOf(payer.publicKey)).to.equal(
          before + taskLamports
        );
        const { nextTask } = await program.account.delegationClaimBotV0.fetch(
          bot.delegationClaimBot
        );
        expect(nextTask.toBase58()).to.equal(newTask.toBase58());
      });

      it("leaves a task whose transaction does not name the bot queued", async () => {
        const { bot, task } = await startedBot();
        const taskLamports = await memoTaskAt(bot, task);

        const newTask = await start(bot, await fundedKeypair());

        expect(await lamportsOf(task)).to.equal(taskLamports);
        const { nextTask } = await program.account.delegationClaimBotV0.fetch(
          bot.delegationClaimBot
        );
        expect(nextTask.toBase58()).to.equal(newTask.toBase58());
      });

      // start accepts the mint and the sub-DAO that the delegated position stores, and the holder
      // of the position token.
      describe("account constraints", () => {
        /** The anchor error code of a start with `overrides`. */
        const startRejection = async (
          overrides: Parameters<typeof start>[3]
        ) => {
          const { bot, payer, task } = await startedBot();
          let code: string | undefined;
          try {
            await start(
              bot,
              await fundedKeypair(),
              [rentRefundMeta(payer.publicKey)],
              overrides
            );
          } catch (e: any) {
            code = e?.error?.errorCode?.code;
            // Anything without an anchor error code is an infra failure, not a program verdict.
            if (!code) throw e;
          }
          const { nextTask } = await program.account.delegationClaimBotV0.fetch(
            bot.delegationClaimBot
          );
          expect(nextTask.toBase58()).to.equal(task.toBase58());
          return code;
        };

        it("requires the mint the delegated position stores", async () => {
          const { mint } = (await startedBot()).bot;

          expect(
            await startRejection({
              mint,
              positionTokenAccount: getAssociatedTokenAddressSync(mint, me),
            })
          ).to.eq("ConstraintHasOne");
        });

        it("requires a position token account of the position's mint", async () => {
          const { mint } = (await startedBot()).bot;

          expect(
            await startRejection({
              positionTokenAccount: getAssociatedTokenAddressSync(mint, me),
            })
          ).to.eq("ConstraintTokenMint");
        });

        it("requires the position authority to hold the position token", async () => {
          expect(
            await startRejection({
              positionAuthority: Keypair.generate().publicKey,
            })
          ).to.eq("ConstraintTokenOwner");
        });

        it("requires the sub-DAO the delegated position stores", async () => {
          const { subDao: otherSubDao } = await initTestSubdao({
            hsdProgram,
            provider,
            authority: me,
            dao: botDao,
            registrar,
          });

          expect(await startRejection({ subDao: otherSubDao })).to.eq(
            "ConstraintHasOne"
          );
        });
      });
    });

    describe("close_delegation_claim_bot_v0", () => {
      it("refunds a task the rent refund queued with no remaining account", async () => {
        const { bot, payer } = await startedBot();
        const task = await start(bot, null, [rentRefundMeta(payer.publicKey)]);
        const { rentRefund } = await tuktukProgram.account.taskV0.fetch(task);
        expect(rentRefund.toBase58()).to.equal(me.toBase58());

        await close(bot, task);

        expect(
          await provider.connection.getAccountInfo(task, "confirmed")
        ).to.equal(null);
        expect(
          await program.account.delegationClaimBotV0.fetchNullable(
            bot.delegationClaimBot
          )
        ).to.equal(null);
      });

      it("fails when the rent refund of the bot's task is not passed", async () => {
        const { bot, task } = await startedBot();

        expect(await errorOf(close(bot, task))).to.eq(
          "RentRefundAccountMissing 6008"
        );
        expect(
          await program.account.delegationClaimBotV0.fetchNullable(
            bot.delegationClaimBot
          )
        ).to.not.equal(null);
      });

      it("fails when the rent refund of the bot's task is a read-only remaining account", async () => {
        const { bot, payer, task } = await startedBot();

        expect(
          await errorOf(
            close(bot, task, [rentRefundMeta(payer.publicKey, false)])
          )
        ).to.eq("RentRefundAccountNotWritable 6009");
        expect(
          await program.account.delegationClaimBotV0.fetchNullable(
            bot.delegationClaimBot
          )
        ).to.not.equal(null);
      });

      it("refunds the bot's task to a writable remaining account", async () => {
        const { bot, payer, task } = await startedBot();
        const taskLamports = await lamportsHeldBy(task);
        expect(await lamportsOf(task)).to.equal(taskLamports);
        const before = await lamportsOf(payer.publicKey);

        await close(bot, task, [rentRefundMeta(payer.publicKey)]);

        expect(
          await provider.connection.getAccountInfo(task, "confirmed")
        ).to.equal(null);
        expect(await lamportsOf(payer.publicKey)).to.equal(
          before + taskLamports
        );
        expect(
          await program.account.delegationClaimBotV0.fetchNullable(
            bot.delegationClaimBot
          )
        ).to.equal(null);
      });

      it("refunds a task that a run returned to the payer of the task that ran", async () => {
        const { bot, payer, task } = await startedBot();
        const returned = await returnedTask(bot, task, payer.publicKey);
        const taskLamports = await lamportsHeldBy(returned);
        expect(await lamportsOf(returned)).to.equal(taskLamports);
        const before = await lamportsOf(payer.publicKey);

        await close(bot, returned, [rentRefundMeta(payer.publicKey)]);

        expect(
          await provider.connection.getAccountInfo(returned, "confirmed")
        ).to.equal(null);
        expect(await lamportsOf(payer.publicKey)).to.equal(
          before + taskLamports
        );
        expect(
          await program.account.delegationClaimBotV0.fetchNullable(
            bot.delegationClaimBot
          )
        ).to.equal(null);
      });

      it("leaves a task whose transaction does not name the bot queued", async () => {
        const { bot, task } = await startedBot();
        const taskLamports = await memoTaskAt(bot, task);

        await close(bot, task);

        expect(await lamportsOf(task)).to.equal(taskLamports);
        expect(
          await program.account.delegationClaimBotV0.fetchNullable(
            bot.delegationClaimBot
          )
        ).to.equal(null);
      });
    });
  });
});
