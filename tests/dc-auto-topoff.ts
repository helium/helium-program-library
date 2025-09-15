import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { dataCreditsKey, delegatedDataCreditsKey, init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHem } from "@helium/helium-entity-manager-sdk";
import { daoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { createAtaAndTransfer, sendInstructions } from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { init as initTuktuk, nextAvailableTaskIds, runTask, taskKey, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey } from "@helium/tuktuk-sdk";
import { createAssociatedTokenAccountIdempotent, createAssociatedTokenAccountIdempotentInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { execSync } from "child_process";
import { init, PROGRAM_ID, queueAuthorityKey } from "../packages/dc-auto-top-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { DcAutoTop } from "../target/types/dc_auto_top";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { ensureDCIdl, ensureHEMIdl, ensureHSDIdl, initWorld } from "./utils/fixtures";

export const ANCHOR_PATH = "anchor";

export async function ensureIdls() {
  let programs = [
    {
      name: "dc_auto_top",
      pid: "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU",
    },
  ];
  await Promise.all(
    programs.map(async (program) => {
      try {
        execSync(
          `${ANCHOR_PATH} idl init --filepath ${__dirname}/../target/idl/${program.name}.json ${program.pid}`,
          { stdio: "inherit", shell: "/bin/bash" }
        );
      } catch {
        execSync(
          `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../target/idl/${program.name}.json ${program.pid}`,
          { stdio: "inherit", shell: "/bin/bash" }
        );
      }
    })
  );
}

describe("dc-auto-topoff", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`;
  let program: Program<DcAutoTop>;
  let tuktukProgram: Program<Tuktuk>;
  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;
  let fanoutName: string;
  let mint: PublicKey;
  let hntMint: PublicKey;
  let delegatedDataCredits: PublicKey;
  let dcMint: PublicKey;
  let routerKey: string;
  let subDao: PublicKey;
  const tuktukConfig: PublicKey = tuktukConfigKey()[0];
  const queueAuthority = queueAuthorityKey()[0]

  let taskQueue: PublicKey;
  before(async () => {
    await ensureHSDIdl()
    await ensureIdls();
    await ensureDCIdl()
    await ensureHEMIdl()
    hemProgram = await initHem(provider)
    hsdProgram = await initHsd(provider)
    program = await init(provider);
    tuktukProgram = await initTuktuk(provider);
    dcProgram = await initDataCredits(provider);
    const config = await tuktukProgram.account.tuktukConfigV0.fetch(
      tuktukConfig
    );
    const nextTaskQueueId = config.nextTaskQueueId;
    taskQueue = taskQueueKey(tuktukConfig, nextTaskQueueId)[0];

    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: taskQueueName,
        minCrankReward: new anchor.BN(1),
        capacity: 1000,
        lookupTables: [],
        staleTaskAge: 10000,
      })
      .accounts({
        tuktukConfig,
        payer: me,
        updateAuthority: me,
        taskQueue,
        taskQueueNameMapping: taskQueueNameMappingKey(tuktukConfig, taskQueueName)[0],
      })
      .rpc();

    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        payer: me,
        queueAuthority,
        taskQueue,
      })
      .rpc();
  })

  beforeEach(async () => {
    routerKey = (await HeliumKeypair.makeRandom()).address.b58;
    ({ dao: { mint: hntMint }, dataCredits: { dcMint }, subDao: { subDao } } = await initWorld(provider, hemProgram, hsdProgram, dcProgram))
    delegatedDataCredits = delegatedDataCreditsKey(subDao, routerKey)[0]
    await dcProgram.methods.delegateDataCreditsV0({
      routerKey,
      amount: new anchor.BN(0),
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(
        me,
        getAssociatedTokenAddressSync(dcMint, me, true),
        me,
        dcMint,
      )
    ])
      .accountsPartial({
        payer: me,
        subDao: subDao,
        delegatedDataCredits,
        dcMint,
        dao: daoKey(hntMint)[0],
        fromAccount: getAssociatedTokenAddressSync(dcMint, me, true),
        dataCredits: dataCreditsKey(dcMint)[0],
      })
      .rpc();
  })


  it("should initialize an auto topoff", async () => {
    const { pubkeys: { autoTopOff } } = await program.methods.initializeAutoTopOffV0({
      schedule: "0 0 * * * *",
      threshold: new anchor.BN(10000000),
      routerKey,
    })
      .accounts({
        payer: me,
        authority: me,
        taskQueue,
        delegatedDataCredits,
      })
      .rpcAndKeys()

    const autoTopOffAcc = await program.account.autoTopOffV0.fetch(autoTopOff)

    expect(autoTopOffAcc.schedule).to.equal("0 0 * * * *")
    expect(autoTopOffAcc.threshold.toString()).to.equal("10000000")
  });

  describe("with an auto topoff", () => {
    let autoTopOff: PublicKey;

    beforeEach(async () => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [nextPythTask, nextTask] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, false)

      const now = new Date()
      let nextSeconds = now.getSeconds() + 2
      let nextMinutes = now.getMinutes()
      if (nextSeconds > 59) {
        nextSeconds = 0 + (nextSeconds - 59)
        nextMinutes = now.getMinutes() + 1
      }
      const { pubkeys: { autoTopOff: autoTopOffK } } = await program.methods.initializeAutoTopOffV0({
        schedule: `${nextSeconds} ${nextMinutes} * * * *`,
        threshold: new anchor.BN(10000000),
        routerKey,
      })
        .accounts({
          payer: me,
          authority: me,
          taskQueue,
          delegatedDataCredits,
        })
        .rpcAndKeys()
      autoTopOff = autoTopOffK

      await sendInstructions(provider, [SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: autoTopOff,
        lamports: 1000000000,
      })]);

      await program.methods.scheduleTaskV0({
        taskId: nextTask,
        pythTaskId: nextPythTask,
      })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          task: taskKey(taskQueue, nextTask)[0],
          pythTask: taskKey(taskQueue, nextPythTask)[0],
        })
        .rpc()
    })

    it("should allow updating schedule", async () => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [nextPythTask, nextTask] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, false)
      await program.methods.updateAutoTopOffV0({
        newTaskId: nextTask,
        newPythTaskId: nextPythTask,
        schedule: "0 0 * * * *",
      })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          newTask: taskKey(taskQueue, nextTask)[0],
          newPythTask: taskKey(taskQueue, nextPythTask)[0],
        })
        .rpcAndKeys()

      const autoTopOffAcc = await program.account.autoTopOffV0.fetch(autoTopOff)
      expect(autoTopOffAcc.schedule).to.equal("0 0 * * * *")
      expect(autoTopOffAcc.nextTask.toBase58()).to.equal(taskKey(taskQueue, nextTask)[0].toBase58())
      expect(autoTopOffAcc.nextPythTask.toBase58()).to.equal(taskKey(taskQueue, nextPythTask)[0].toBase58())
    })

    async function runAllTasks() {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);

      // Find all task IDs that need to be executed (have a 1 in the bitmap)
      const taskIds: number[] = [];
      for (let i = 0; i < taskQueueAcc.taskBitmap.length; i++) {
        const byte = taskQueueAcc.taskBitmap[i];
        for (let bit = 0; bit < 8; bit++) {
          if ((byte & (1 << bit)) !== 0) {
            taskIds.push(i * 8 + bit);
          }
        }
      }

      // Execute all tasks in parallel
      for (const taskId of taskIds) {
        const task = taskKey(taskQueue, taskId)[0]
        const taskAcc = await tuktukProgram.account.taskV0.fetch(task)
        if ((taskAcc.trigger.timestamp?.[0]?.toNumber() || 0) > (new Date().getTime() / 1000) || taskAcc.transaction.remoteV0) {
          continue
        }
        console.log("Running task", taskId)
        await sendInstructions(
          provider,
          [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
            ...await runTask({
              program: tuktukProgram,
              task: taskKey(taskQueue, taskId)[0],
              crankTurner: me,
            })]
        );
      }
    }

    it("should topoff the delegated data credits", async () => {
      await createAtaAndTransfer(provider, hntMint, 10000000000, me, autoTopOff)
      await new Promise(resolve => setTimeout(resolve, 2000))
      await runAllTasks()
      const delegatedDataCreditsAcc = await dcProgram.account.delegatedDataCreditsV0.fetch(delegatedDataCredits)
      const escrow = delegatedDataCreditsAcc.escrowAccount
      const escrowBalance = await getAccount(provider.connection, escrow)
      expect(Number(escrowBalance.amount)).to.equal(10000000)
    })
  })
});