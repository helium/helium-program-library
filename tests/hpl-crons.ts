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
      })
      .rpc({ skipPreflight: true });
  });

  // Regression test for the mainnet outage where queue_end_epoch blew the 32KB
  // SBF heap ("memory allocation failed, out of memory") while serializing the
  // two compiled return transactions. Mirrors the production flow exactly:
  // start-cron.ts queues the bootstrap task, then a crank turner runs it.
  it("runs queue_end_epoch through tuktuk without exhausting the heap", async () => {
    const [customWallet, bump] = customSignerKey(taskQueue, [
      Buffer.from("helium", "utf-8"),
    ]);
    // The custom signer PDA pays rent for the task return account
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: customWallet,
        lamports: 1000000000,
      }),
    ]);

    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);
    const [epochTracker] = epochTrackerKey(dao);
    const { transaction, remainingAccounts } = compileTransaction(
      [
        await program.methods
          .queueEndEpoch()
          .accountsStrict({
            payer: customWallet,
            taskReturnAccount: taskReturnAccountKey()[0],
            epochTracker,
            taskQueue,
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

    const epochBefore = (
      await program.account.epochTrackerV0.fetch(epochTracker)
    ).epoch;

    const task = taskKey(taskQueue, 0)[0];
    await tuktukProgram.methods
      .queueTaskV0({
        id: 0,
        trigger: { now: {} },
        crankReward: null,
        freeTasks: 2,
        transaction: {
          compiledV0: [transaction],
        },
        description: `queue end epoch ${epochBefore.add(new anchor.BN(1))}`,
      })
      .accountsPartial({
        task,
        taskQueue,
      })
      .remainingAccounts(remainingAccounts)
      .rpc({ skipPreflight: true });

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
        maxSupportedTransactionVersion: 0,
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
});
