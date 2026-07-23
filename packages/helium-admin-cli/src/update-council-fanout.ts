import * as anchor from "@coral-xyz/anchor";
import { init as initMfan } from "@helium/mini-fanout-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { allocateNextTasks, resolveTaskRentRefund } from "./mini-fanout-utils";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";

// HIP 149 Decision 4: update the Advisory Council compensation fanout created by
// create-council-fanout.ts. Use this on a seat change (add/remove a member) or to
// change the distribution schedule.
//
// Operational rules (see HIP 149 Decision 4, and the header comment on
// create-council-fanout.ts):
//   - CRANK before running this on a seat change. `update_mini_fanout_v0` replaces
//     the share vec wholesale, so accrual (total_owed) for members not carried
//     forward is lost. Let the current period's distribution run first so accrual
//     maps to the set that was actually seated when it accrued, then update.
//   - The fanout's `owner` (a governance multisig vault) must sign this. Pass
//     `--multisig <governance multisig address>` to route it through Squads V4
//     as a proposal instead of trying to send it directly.
//   - Omitting --members leaves the current share set untouched (only the
//     schedule changes, if given). Omitting --schedule leaves the cron
//     untouched. Passing neither still re-queues the next distribution task,
//     which is a valid way to force a reschedule on an already-scheduled fanout
//     (an idle/unscheduled one should use reschedule-all-mini-fanouts.ts instead,
//     since that path doesn't need the owner's signature).
//   - This instruction bakes in the fanout's *current* next_task/next_pre_task
//     (has_one-checked on-chain) and a task id claimed from the queue's current
//     bitmap at build time -- both can go stale while a Squads proposal sits
//     waiting for approval (the cron can self-reschedule to a new next_task, or
//     another queue_task_v0 call can claim the same id first). Either makes
//     execution fail on-chain (has_one mismatch or TaskAlreadyExists) rather
//     than corrupt anything, but the proposal is then permanently dead and must
//     be rebuilt from a fresh run of this script. Get proposals approved
//     promptly; if one sits for a while, re-run this script and re-propose
//     rather than trusting a stale one to still execute.
export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair (payer; proposer if using --multisig)",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    miniFanout: {
      type: "string",
      required: true,
      describe: "Address of the mini fanout to update",
    },
    members: {
      type: "string",
      describe:
        "Comma-separated seated community-member wallet addresses to replace the current share set with (each gets an equal share). Omit to leave shares unchanged.",
    },
    schedule: {
      type: "string",
      describe:
        "New cron schedule (sec min hour day month dow) for the distribution crank. Omit to leave the schedule unchanged.",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to propose through. Required in practice, since the fanout owner is the governance multisig and must sign this update.",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));

  const program = await initMfan(provider);
  const tuktukProgram = await initTuktuk(provider);

  const miniFanout = new PublicKey(argv.miniFanout);
  const miniFanoutAcc = await program.account.miniFanoutV0.fetch(miniFanout);

  const shares = argv.members
    ? argv.members
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
        .map((m) => ({
          wallet: new PublicKey(m),
          share: { share: { amount: 1 } },
        }))
    : null;
  if (argv.members && shares!.length === 0) {
    throw new Error("--members was given but resolved to zero wallets");
  }

  const { taskId, preTaskId, task, preTask } = await allocateNextTasks(
    tuktukProgram,
    miniFanoutAcc.taskQueue
  );
  const taskRentRefund = await resolveTaskRentRefund(
    tuktukProgram,
    miniFanoutAcc.nextTask,
    miniFanout,
    program.programId,
    wallet.publicKey
  );

  const updateIx = await program.methods
    .updateMiniFanoutV0({
      newTaskId: taskId,
      newPreTaskId: preTaskId,
      shares,
      schedule: argv.schedule ?? null,
    })
    .accountsPartial({
      owner: miniFanoutAcc.owner,
      payer: wallet.publicKey,
      miniFanout,
      taskQueue: miniFanoutAcc.taskQueue,
      newTask: task,
      newPreTask: preTask,
      taskRentRefund,
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [updateIx],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });

  console.log("Council fanout updated.");
  console.log(`  mini fanout: ${miniFanout.toBase58()}`);
  if (shares) {
    console.log(`  members (${shares.length}):`);
    shares.forEach((s) => console.log(`    - ${s.wallet.toBase58()}`));
  }
  if (argv.schedule) {
    console.log(`  schedule: ${argv.schedule}`);
  }
}
