import { BN } from "@anchor-lang/core";
import { AccountMeta, PublicKey } from "@solana/web3.js";
import { dcaTaskBindingError, DcaTaskFields } from "./binding";
import { buildFittingTask, CrankTooLargeError } from "./crank";

/** A run request's body, as the crank turner posts it. */
export interface DcaRequestBody {
  task_queue: string;
  task: string;
  task_queued_at: string;
}

/** The DCA account fields a run request reads. */
export interface DcaOrder extends DcaTaskFields {
  numOrders: number;
  swapAmountPerOrder: BN;
}

/** A remote task signed for the crank turner, with what the answer reports of it. */
export interface SignedDcaTask {
  serialized: Buffer;
  signature: Buffer;
  remainingAccounts: AccountMeta[];
  lookupTables: string[];
}

/** A DCA order's task built within `maxBytes`, and the size of its crank transaction. */
export type BuildDcaTask = (
  maxBytes: number
) => Promise<{ task: SignedDcaTask; size: number | undefined }>;

/** The chain reads and the task build a run request needs. */
export interface DcaRequestDeps<O extends DcaOrder> {
  fetchOrder: (dca: PublicKey) => Promise<O>;
  /** The input account's token balance. */
  fetchInputBalance: (order: O) => Promise<BN>;
  /** The task builder for one order of `order`, swapping `swapAmount`. */
  prepareTask: (
    dca: PublicKey,
    order: O,
    swapAmount: BN
  ) => Promise<BuildDcaTask>;
}

/** The status and JSON body the service answers a run request with. */
export interface DcaReply {
  status: number;
  body: unknown;
}

/**
 * Answer a run request for the DCA `dcaKey`: 200 with the signed remote task, 400 when the
 * request does not name the DCA's next task, 422 when no route builds a crank transaction that
 * fits, and 500 for every other failure. The last order swaps the whole input balance.
 */
export const answerDcaRequest = async <O extends DcaOrder>(
  deps: DcaRequestDeps<O>,
  dcaKey: string,
  body: DcaRequestBody
): Promise<DcaReply> => {
  try {
    const dca = new PublicKey(dcaKey);
    const task = new PublicKey(body.task);
    const taskQueue = new PublicKey(body.task_queue);
    const taskQueuedAt = new BN(body.task_queued_at);

    const order = await deps.fetchOrder(dca);
    const bindingError = dcaTaskBindingError(
      { task, taskQueue, taskQueuedAt },
      order
    );
    if (bindingError) {
      return { status: 400, body: { error: bindingError } };
    }

    const inputBalance = await deps.fetchInputBalance(order);
    const swapAmount =
      order.numOrders === 1 ? inputBalance : order.swapAmountPerOrder;
    const { serialized, signature, remainingAccounts, lookupTables } =
      await buildFittingTask(await deps.prepareTask(dca, order, swapAmount));

    return {
      status: 200,
      body: {
        transaction: serialized.toString("base64"),
        signature: signature.toString("base64"),
        remaining_accounts: remainingAccounts.map((acc) => ({
          pubkey: acc.pubkey.toBase58(),
          is_signer: acc.isSigner,
          is_writable: acc.isWritable,
        })),
        lookup_tables: lookupTables,
      },
    };
  } catch (err: any) {
    console.error("DCA swap error:", err);
    return {
      status: err instanceof CrankTooLargeError ? 422 : 500,
      body: { error: err.message },
    };
  }
};
