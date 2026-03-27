import { expect } from "chai"
import type { TestCtx } from "./context"
import type { TransactionData, TokenAmountOutput } from "@helium/blockchain-api/schemas/common"

const ESTIMATE_TOLERANCE_LAMPORTS = 1000000 // 0.001 SOL

/**
 * Verify that a lightweight estimatedSolFee is within 0.001 SOL of simulated estimate.
 * Call this inline in any test that creates transaction data.
 */
export async function verifyEstimatedSolFee(
  ctx: TestCtx,
  transactionData: TransactionData,
  estimatedSolFee: TokenAmountOutput,
): Promise<void> {
  const { data: simulated, error } = await ctx.safeClient.transactions.estimate({
    transactions: transactionData.transactions,
    parallel: transactionData.parallel,
  })

  if (error) {
    throw new Error(`Estimate endpoint failed: ${JSON.stringify(error)}`)
  }

  const lightweight = BigInt(estimatedSolFee.amount)
  const simulatedAmount = BigInt(simulated.totalSol.amount)
  const diff = lightweight > simulatedAmount
    ? lightweight - simulatedAmount
    : simulatedAmount - lightweight

  expect(Number(diff)).to.be.lessThan(
    ESTIMATE_TOLERANCE_LAMPORTS,
    `estimatedSolFee ${lightweight} should be within ${ESTIMATE_TOLERANCE_LAMPORTS} lamports of simulated ${simulatedAmount}`,
  )
}
