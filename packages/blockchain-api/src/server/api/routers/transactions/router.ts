import { submit } from "./procedures/submit";
import { get } from "./procedures/get";
import { resubmit } from "./procedures/resubmit";
import { getByPayer } from "./procedures/getByPayer";
import { getByPayerAndTag } from "./procedures/getByPayerAndTag";
import { estimate } from "./procedures/estimate";
import { transactionsContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

/**
 * Transactions router - handles transaction submission and status tracking.
 */
export const transactionsRouter = implement(transactionsContract).router({
  /** Submit a batch of transactions */
  submit,
  /** Get transaction batch status by ID */
  get,
  /** Resubmit a batch of pending transactions */
  resubmit,
  /** Get transaction batches by payer */
  getByPayer,
  /** Get transaction batches by payer and tag */
  getByPayerAndTag,
  /** Estimate transaction costs */
  estimate,
});
