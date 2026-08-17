import { init as initDcAutoTop } from "@helium/dc-auto-top-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { PublicKey } from "@solana/web3.js";
import { autoTopOffTaskTrigger } from "../metrics";
import { provider } from "../solana";
import { watch } from "./watch";

type Leg = "dc" | "hnt";

/**
 * Tracks whether each leg of a `dc-auto-top` account is still being cranked.
 *
 * Both legs are self-rescheduling: a run reschedules itself as its last step, so a
 * healthy leg always points at a task whose trigger is in the future. Every way a leg
 * can break — a stale or wrong-owner price oracle, an empty DCA input account, a
 * `dca` PDA left over from an undrained run, lamports below the crank reward, a
 * reverting swap — ends the same way, with no reschedule. tuktuk then retries the
 * task until it goes stale and is swept, after which nothing restarts the leg without
 * `schedule_task_v0`. So the trigger time of the task each leg points at is the single
 * signal that covers all of them.
 */
export async function monitorAutoTopOff(autoTopOff: PublicKey, label: string) {
  const dcAutoTopProgram = await initDcAutoTop(provider);
  const tuktukProgram = await initTuktuk(provider);
  const address = autoTopOff.toBase58();

  async function publish(leg: Leg, task: PublicKey) {
    // Two ways a leg has no task: the program parks its own key in the field as a
    // "nothing scheduled" sentinel, because a zero pubkey cannot be passed as a mutable
    // account; and a task that kept failing is swept once stale. Both mean the leg is
    // dead until something reschedules it, and both report 0.
    const acc = task.equals(autoTopOff)
      ? null
      : await tuktukProgram.account.taskV0.fetchNullable(task);
    if (!acc) {
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
    } catch (e) {
      // Leave the previous reading in place rather than zeroing it: an RPC failure is
      // not a stalled leg, and reporting one as the other would page on every blip.
      // `watch` re-runs this every 5 minutes, so a real stall is still picked up.
      console.error(`autoTopOff monitor failed for ${label} (${address})`, e);
    }
  });
}
