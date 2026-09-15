import { init as initDcAutoTop } from "@helium/dc-auto-top-sdk";
import { init as initTuktukDca } from "@helium/tuktuk-dca-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { PublicKey } from "@solana/web3.js";
import { autoTopOffTaskTrigger } from "../metrics";
import { provider } from "../solana";
import { watch } from "./watch";

type Leg = "dc" | "hnt" | "dca";

/**
 * Whether a task account is this leg's own.
 *
 * tuktuk reuses task ids, so once a leg's task is swept another program's task takes the
 * same address and the stored pointer still resolves. The trigger it carries is then
 * somebody else's, and a stalled leg reads as a healthy one. Each program stamps the task
 * it queues with a description carrying the truncated key it belongs to, so the
 * description is what distinguishes its own task from a squatter at the same id.
 */
function ownsTask(description: string, leg: Leg, address: string): boolean {
  if (leg === "dca") {
    // Mirrors the slice tuktuk-dca takes in initialize_dca_v0 and check_repay_v0
    // ([..32 - 4]).
    return description === `dca ${address.slice(0, 32 - 4)}`;
  }
  // Mirrors the slice the program takes in top_off_dc_v0 ([..32 - 14]) and
  // top_off_hnt_v0 ([..32 - 15]).
  const keep = leg === "dc" ? 32 - 14 : 32 - 15;
  return description === `topoff ${leg} ${address.slice(0, keep)}`;
}

/**
 * Tracks whether each leg of a `dc-auto-top` account is still being cranked.
 *
 * Both legs are self-rescheduling: a run reschedules itself as its last step, so a
 * healthy leg always points at a task whose trigger is in the future. The ways a leg
 * ends without a reschedule are a stale or wrong-owner price oracle, lamports below the
 * crank reward, and a reverting swap or run. tuktuk then retries the task until it goes
 * stale and is swept, after which nothing restarts the leg without `schedule_task_v0`.
 * So the trigger time of the task each leg points at is the single signal that covers
 * all of them.
 *
 * An empty DCA input account does not stop the leg rescheduling — the run logs a skip
 * and reschedules — and neither does a DCA chain that dies after it is funded, since
 * nothing reads `auto_top_off.dca` back. That is why the USDC balance gauge and the
 * `dca` leg below exist: a DCA whose task chain stops has no series of its own, while
 * `next_hnt_task` stays in the future.
 */
export async function monitorAutoTopOff(autoTopOff: PublicKey, label: string) {
  const dcAutoTopProgram = await initDcAutoTop(provider);
  const tuktukProgram = await initTuktuk(provider);
  const dcaProgram = await initTuktukDca(provider);
  const address = autoTopOff.toBase58();

  // `owner` is the key stamped into the task description: the auto top off for the dc and
  // hnt legs, and the DCA itself for the dca leg. tuktuk-dca never parks its own key as a
  // sentinel, so the equals check below is a no-op for that leg.
  async function publish(
    leg: Leg,
    task: PublicKey,
    owner: PublicKey = autoTopOff
  ) {
    // Three ways a leg has no task of its own: the program parks its own key in the
    // field as a "nothing scheduled" sentinel, because a zero pubkey cannot be passed as
    // a mutable account; a task that kept failing is swept once stale; and a swept task's
    // id gets reused, leaving the pointer resolving to somebody else's task. All three
    // mean the leg is dead until something reschedules it, and all three report 0.
    const acc = task.equals(owner)
      ? null
      : await tuktukProgram.account.taskV0.fetchNullable(task);
    if (!acc || !ownsTask(acc.description, leg, owner.toBase58())) {
      autoTopOffTaskTrigger.set({ name: label, leg, address }, 0);
      return;
    }

    // A `now` trigger carries no time of its own, so it is overdue from when it was
    // queued; `timestamp` holds its i64 in an unnamed field, decoded as index 0.
    const trigger = acc.trigger as any;
    const seconds = trigger.timestamp
      ? trigger.timestamp[0].toNumber()
      : acc.queuedAt.toNumber();
    autoTopOffTaskTrigger.set({ name: label, leg, address }, seconds);
  }

  watch(autoTopOff, async (raw) => {
    if (!raw) return;
    try {
      const acc = dcAutoTopProgram.coder.accounts.decode(
        "autoTopOffV0",
        raw.data
      );
      await publish("dc", acc.nextTask);
      await publish("hnt", acc.nextHntTask);

      // A DCA that has run its last order closes, and one that never started leaves the
      // field at its previous value. Dropping the series says "no DCA to crank", where a
      // 0 would say "a DCA is stalled".
      const dca = await dcaProgram.account.dcaV0.fetchNullable(acc.dca);
      if (!dca || dca.numOrders === 0) {
        autoTopOffTaskTrigger.remove({ name: label, leg: "dca", address });
      } else {
        await publish("dca", dca.nextTask, acc.dca);
      }
    } catch (e) {
      // Leave the previous reading in place rather than zeroing it: an RPC failure is
      // not a stalled leg, and reporting one as the other would page on every blip.
      // `watch` re-runs this every 5 minutes, so a real stall is still picked up.
      console.error(`autoTopOff monitor failed for ${label} (${address})`, e);
    }
  });
}
