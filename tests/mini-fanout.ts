import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createAtaAndMint, createMint, sendInstructions, toBN } from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { compileTransaction, init as initTuktuk, nextAvailableTaskIds, runTask, taskKey, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey } from "@helium/tuktuk-sdk";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createMemoInstruction } from "@solana/spl-memo";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { execSync } from "child_process";
import { init, PROGRAM_ID, queueAuthorityKey } from "../packages/mini-fanout-sdk/src";
import { MiniFanout } from "../target/types/mini_fanout";

chai.use(chaiAsPromised);

export const ANCHOR_PATH = "anchor";

// shared_utils::ORACLE_SIGNER, which the tests build against because `anchor build` here runs
// without the `devnet` feature.
const ORACLE_SIGNER = new PublicKey(
  "orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q"
);

// A schedule whose next occurrence is always a second away, however long the setup before it
// took. A cron string built from `now + 2 seconds` is only correct if the transactions that
// follow it land inside those two seconds; when they don't, the next occurrence is an hour
// out and the run fails on balances rather than on the thing under test.
const EVERY_SECOND = "* * * * * *";

export async function ensureIdls() {
  let programs = [
    {
      name: "mini_fanout",
      pid: "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn",
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

describe("mini-fanout", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`;
  let wallet1: Keypair;
  let wallet2: Keypair;
  let wallet3: Keypair;
  let shares: { wallet: PublicKey, share: { share: { amount: number } } | { fixed: { amount: anchor.BN } } }[] = []
  let program: Program<MiniFanout>;
  let tuktukProgram: Program<Tuktuk>;
  let fanoutName: string;
  let mint: PublicKey;
  const tuktukConfig: PublicKey = tuktukConfigKey()[0];
  const queueAuthority = queueAuthorityKey()[0]
  const FANOUT_AMOUNT = 1000000000

  // compileTransaction hands the account list back separately so it can ride as remaining
  // accounts on queue_task_v0, which merges them in. A pre task is stored on the fanout
  // instead, so it has to carry its own accounts for program_id_index to resolve against.
  const memoPreTask = (() => {
    const { transaction, remainingAccounts } = compileTransaction(
      [createMemoInstruction("HELLO!", [])],
      []
    )
    return { ...transaction, accounts: remainingAccounts.map((a) => a.pubkey) }
  })()

  let taskQueue: PublicKey;
  before(async () => {
    mint = await createMint(provider, 8, me, me)

    await ensureIdls();
    program = await init(provider, PROGRAM_ID, anchor.workspace.MiniFanout.idl);
    tuktukProgram = await initTuktuk(provider);
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
    fanoutName = `test-${Math.random().toString(36).substring(2, 15)}`;
    wallet1 = Keypair.generate()
    wallet2 = Keypair.generate()
    wallet3 = Keypair.generate()
    shares = [
      {
        wallet: wallet1.publicKey,
        share: {
          share: {
            amount: 50,
          }
        },
      },
      {
        wallet: wallet2.publicKey,
        share: {
          share: {
            amount: 50,
          }
        },
      },
      {
        wallet: wallet3.publicKey,
        share: {
          fixed: {
            amount: toBN(1, 8),
          }
        },
      }
    ]
    await createAtaAndMint(provider, mint, 1000000000, me)
    await createAtaAndMint(provider, mint, 0, wallet1.publicKey)
    await createAtaAndMint(provider, mint, 0, wallet3.publicKey)
  })


  it("should initialize a fanout", async () => {
    console.log("Task queue is", taskQueue.toBase58())
    const { pubkeys: { miniFanout } } = await program.methods.initializeMiniFanoutV0({
      seed: Buffer.from(fanoutName, "utf-8"),
      shares,
      schedule: "0 0 * * * *",
      preTask: { compiledV0: [memoPreTask as any] }
    })
      .accounts({
        payer: me,
        owner: me,
        taskQueue,
        rentRefund: me,
        mint,
      })
      .rpcAndKeys()

    const miniFanoutAcc = await program.account.miniFanoutV0.fetch(miniFanout)

    expect(miniFanoutAcc.seed.toString()).to.equal(fanoutName)
    expect(miniFanoutAcc.shares.length).to.equal(shares.length)
    for (let i = 0; i < shares.length; i++) {
      expect(miniFanoutAcc.shares[i].wallet.toBase58()).to.equal(shares[i].wallet.toBase58())
      if ('share' in shares[i].share) {
        // @ts-ignore
        expect(miniFanoutAcc.shares[i].share.share!.amount).to.equal(shares[i].share.share!.amount)
      } else {
        // @ts-ignore
        expect(miniFanoutAcc.shares[i].share.fixed!.amount.toString()).to.equal(shares[i].share.fixed!.amount.toString())
      }
      expect(miniFanoutAcc.shares[i].totalDust.toString()).to.equal("0")
    }
  });

  describe("pre task shapes", () => {
    const ORACLE_URL = "https://hnt-rewards.oracle.helium.io/v1/tuktuk/asset/1"

    const initWith = (preTask: any) =>
      program.methods.initializeMiniFanoutV0({
        seed: Buffer.from(fanoutName, "utf-8"),
        shares,
        schedule: "0 0 * * * *",
        preTask,
      })
        .accounts({
          payer: me,
          owner: me,
          taskQueue,
          rentRefund: me,
          mint,
        })
        .rpcAndKeys()

    const scheduleFor = async (miniFanout: PublicKey) => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [preTaskId, taskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, true)
      return program.methods.scheduleTaskV0({ taskId, preTaskId })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 })])
        .accounts({
          payer: me,
          miniFanout,
          task: taskKey(taskQueue, taskId)[0],
          preTask: taskKey(taskQueue, preTaskId)[0],
        })
        .rpc()
    }

    const refused = /Error Code: InvalidPreTask\. Error Number: 6011\./

    it("queues a remote pre task the oracle signs", async () => {
      const { pubkeys: { miniFanout } } = await initWith({
        remoteV0: { url: ORACLE_URL, signer: ORACLE_SIGNER },
      })

      const acc = await program.account.miniFanoutV0.fetch(miniFanout)
      expect(acc.preTask!.remoteV0!.signer.toBase58()).to.equal(ORACLE_SIGNER.toBase58())
      await scheduleFor(miniFanout)
    })

    it("queues a compiled pre task carrying no seeds", async () => {
      const { pubkeys: { miniFanout } } = await initWith({
        compiledV0: [memoPreTask as any],
      })

      // The instruction has to survive the round trip, or the refusals below could be passing
      // because the transaction arrived empty rather than because it was refused.
      const acc = await program.account.miniFanoutV0.fetch(miniFanout)
      expect(acc.preTask!.compiledV0![0].instructions.length).to.equal(1)
      expect(acc.preTask!.compiledV0![0].signerSeeds).to.deep.equal([])
      await scheduleFor(miniFanout)
    })

    it("refuses to queue a remote pre task signed by anyone else", async () => {
      const { pubkeys: { miniFanout } } = await initWith({
        remoteV0: { url: ORACLE_URL, signer: Keypair.generate().publicKey },
      })

      await expect(scheduleFor(miniFanout)).to.eventually.be.rejectedWith(refused)
    })

    it("refuses to queue a compiled pre task carrying signer seeds", async () => {
      const { pubkeys: { miniFanout } } = await initWith({
        compiledV0: [{
          ...(memoPreTask as any),
          signerSeeds: [[Buffer.from("helium", "utf-8"), Buffer.from([253])]],
        }],
      })

      await expect(scheduleFor(miniFanout)).to.eventually.be.rejectedWith(refused)
    })

    it("refuses to queue a compiled pre task carrying an empty seed group", async () => {
      const { pubkeys: { miniFanout } } = await initWith({
        compiledV0: [{ ...(memoPreTask as any), signerSeeds: [[]] }],
      })

      await expect(scheduleFor(miniFanout)).to.eventually.be.rejectedWith(refused)
    })
  })

  describe("with a fanout", () => {
    let fanout: PublicKey;
    beforeEach(async () => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [nextPreTask, nextTask] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, true)

      const { pubkeys: { miniFanout: fanoutK } } = await program.methods.initializeMiniFanoutV0({
        seed: Buffer.from(fanoutName, "utf-8"),
        schedule: EVERY_SECOND,
        shares,
        preTask: { compiledV0: [memoPreTask as any] }
      })
        .accounts({
          payer: me,
          owner: me,
          taskQueue,
          rentRefund: me,
          mint,
        })
        .rpcAndKeys()

      await sendInstructions(provider, [SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: fanoutK,
        lamports: 1000000000,
      })]);

      await program.methods.scheduleTaskV0({
        taskId: nextTask,
        preTaskId: nextPreTask,
      })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          miniFanout: fanoutK,
          task: taskKey(taskQueue, nextTask)[0],
          preTask: taskKey(taskQueue, nextPreTask)[0],
        })
        .rpc()

      fanout = fanoutK
      await createAtaAndMint(provider, mint, FANOUT_AMOUNT, fanoutK)
    })

    it("should allow updating wallets and schedule", async () => {
      const newWallet = Keypair.generate()
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [nextPreTask, nextTask] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, true)
      await program.methods.updateMiniFanoutV0({
        shares: [
          {
            wallet: newWallet.publicKey,
            share: {
              share: {
                amount: 10,
              }
            },
          }
        ],
        newTaskId: nextTask,
        newPreTaskId: nextPreTask,
        schedule: "0 0 * * * *",
      })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          miniFanout: fanout,
          newTask: taskKey(taskQueue, nextTask)[0],
          newPreTask: taskKey(taskQueue, nextPreTask)[0],
          taskRentRefund: me,
        })
        .rpcAndKeys()

      const miniFanoutAcc = await program.account.miniFanoutV0.fetch(fanout)
      expect(miniFanoutAcc.shares.length).to.equal(1)
      expect(miniFanoutAcc.shares[0].wallet.toBase58()).to.equal(newWallet.publicKey.toBase58())
      expect(miniFanoutAcc.shares[0].share.share!.amount).to.equal(10)
      expect(miniFanoutAcc.shares[0].totalDust.toString()).to.equal(toBN(0, 8).toString())
      console.log("nextTask", miniFanoutAcc.nextTask.toBase58())
      console.log("nextPreTask", miniFanoutAcc.nextPreTask.toBase58())
      expect(miniFanoutAcc.nextTask.toBase58()).to.equal(taskKey(taskQueue, nextTask)[0].toBase58())
      expect(miniFanoutAcc.schedule).to.equal("0 0 * * * *")
    })

    it("should allow updating wallet delegates", async () => {
      const newWallet = Keypair.generate()
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [nextPreTask, nextTask] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, true)
      await program.methods.updateWalletDelegateV0({
        newTaskId: nextTask,
        newPreTaskId: nextPreTask,
        delegate: newWallet.publicKey,
        index: 0
      })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          wallet: wallet1.publicKey,
          miniFanout: fanout,
          newTask: taskKey(taskQueue, nextTask)[0],
          newPreTask: taskKey(taskQueue, nextPreTask)[0],
        })
        .signers([wallet1])
        .rpcAndKeys()

      const miniFanoutAcc = await program.account.miniFanoutV0.fetch(fanout)
      expect(miniFanoutAcc.shares[0].delegate.toBase58()).to.equal(newWallet.publicKey.toBase58())
    })

    async function runAllTasks(tries = 0) {
      try {
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
      } catch (e: any) {
        // Retry only what a retry can fix: a task whose trigger had not passed when it was
        // tried. Retrying every error made a real failure read as intermittent and reported
        // it three attempts late, against the wrong one of the three.
        const notReady = String(e.message ?? e).includes("TaskNotReady")
        if (!notReady || tries >= 2) {
          throw e
        }
        console.log(`task not ready, retrying (${tries + 1}/2)`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        await runAllTasks(tries + 1)
      }
    }

    // The widest distribution the program allows, and so the one whose compute cost the CU
    // table is sized against. It runs against a validator rather than under bankrun because
    // the sampler that keeps that table honest reads localnet traffic. The narrower cases,
    // and the ones that need state a program will not write, are in mini-fanout-bankrun.ts.
    it("should distribute tokens to 6 wallets in one tx", async () => {
      const wallets = Array.from({ length: 6 }, () => Keypair.generate())
      const shares = wallets.map(w => ({
        wallet: w.publicKey,
        share: { share: { amount: 10 } },
      }))

      // Mint to all wallets
      for (const w of wallets) {
        await createAtaAndMint(provider, mint, 0, w.publicKey)
      }

      // Get next available task
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [nextPreTask, nextTask] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2, true)

      console.log("creating fanout")
      const { pubkeys: { miniFanout: fanoutK } } = await program.methods.initializeMiniFanoutV0({
        seed: Buffer.from(fanoutName + 'big', "utf-8"),
        schedule: EVERY_SECOND,
        shares,
        preTask: { compiledV0: [memoPreTask as any] }
      })
        .accounts({
          payer: me,
          owner: me,
          taskQueue,
          rentRefund: me,
          mint,
        })
        .rpcAndKeys()

      console.log("transferring")
      await sendInstructions(provider, [SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: fanoutK,
        lamports: FANOUT_AMOUNT,
      })])

      console.log("scheduling task")
      await program.methods.scheduleTaskV0({
        taskId: nextTask,
        preTaskId: nextPreTask,
      })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          miniFanout: fanoutK,
          task: taskKey(taskQueue, nextTask)[0],
          preTask: taskKey(taskQueue, nextPreTask)[0],
        })
        .rpc()

      await createAtaAndMint(provider, mint, 600000000, fanoutK)

      // Wait for cron and run all tasks
      await new Promise(resolve => setTimeout(resolve, 2000))
      console.log("running tasks")
      await runAllTasks()

      // Check all 10 wallets received their share
      const fanoutTokenAccount = await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(mint, fanoutK, true)
      )
      expect(Number(fanoutTokenAccount.amount)).to.equal(0)
      for (const w of wallets) {
        const walletTokenAccount = await getAccount(
          provider.connection,
          getAssociatedTokenAddressSync(mint, w.publicKey)
        )
        // Each gets 800000000 (1/8th of FANOUT_AMOUNT)
        expect(Number(walletTokenAccount.amount)).to.equal(100000000)
      }
    })

    it("should allow closing the fanout", async () => {
      await program.methods.closeMiniFanoutV0()
        .accounts({
          miniFanout: fanout,
          taskRentRefund: me,
        })
        .rpc()
    })
  })
});