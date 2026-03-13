import { env } from "@/lib/env";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { BASE_TX_FEE_LAMPORTS } from "@/lib/utils/balance-validation";
import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { publicProcedure } from "../../../procedures";
import type { TokenAmountOutput } from "@helium/blockchain-api/schemas/common";

const SOL_MINT = NATIVE_MINT.toBase58();

function solOutput(lamports: BN): TokenAmountOutput {
  return toTokenAmountOutput(lamports, SOL_MINT);
}

function zeroSol(): TokenAmountOutput {
  return solOutput(new BN(0));
}

/**
 * Estimate transaction costs by simulating transactions.
 */
export const estimate = publicProcedure.transactions.estimate.handler(
  async ({ input, errors }) => {
    const { transactions, simulationCommitment } = input;

    if (
      !transactions ||
      !Array.isArray(transactions) ||
      transactions.length === 0
    ) {
      throw errors.BAD_REQUEST({
        message: "Transactions array is required and cannot be empty",
      });
    }

    if (transactions.length > 5) {
      throw errors.BAD_REQUEST({
        message: "Maximum of 5 transactions allowed per batch",
      });
    }

    const connection = new Connection(env.SOLANA_RPC_URL);

    // Aggregate totals
    let totalTransactionFees = new BN(0);
    let totalRent = new BN(0);
    const tokenTransfersByMint = new Map<string, BN>();

    const transactionEstimates = await Promise.all(
      transactions.map(async (tx, index) => {
        // Deserialize the transaction
        let transaction: VersionedTransaction;
        try {
          transaction = VersionedTransaction.deserialize(
            Buffer.from(tx.serializedTransaction, "base64"),
          );
        } catch (err) {
          return {
            index,
            computeUnits: 0,
            success: false,
            error: `Failed to deserialize transaction: ${err instanceof Error ? err.message : "Unknown error"}`,
            costs: {
              transactionFees: zeroSol(),
              rent: zeroSol(),
              tokenTransfers: [],
            },
          };
        }

        // Get all account keys for simulation
        const accountKeys = transaction.message.staticAccountKeys.map((k) =>
          k.toBase58(),
        );

        // Simulate the transaction with account info
        const simulation = await connection.simulateTransaction(transaction, {
          commitment: simulationCommitment,
          accounts: {
            encoding: "base64",
            addresses: accountKeys,
          },
        });

        if (simulation.value.err) {
          const errorMessage =
            typeof simulation.value.err === "string"
              ? simulation.value.err
              : JSON.stringify(simulation.value.err);

          return {
            index,
            computeUnits: simulation.value.unitsConsumed ?? 0,
            success: false,
            error: `Simulation failed: ${errorMessage}`,
            logs: simulation.value.logs ?? undefined,
            costs: {
              transactionFees: zeroSol(),
              rent: zeroSol(),
              tokenTransfers: [],
            },
          };
        }

        // Calculate transaction fee (base fee + priority fee if any)
        // For now we use the base fee since priority fees vary
        const txFee = new BN(BASE_TX_FEE_LAMPORTS);
        totalTransactionFees = totalTransactionFees.add(txFee);

        // Detect rent from new account creations
        // We'll check pre/post balances to find accounts that were created
        let rentCost = new BN(0);
        const preBalances = await getAccountBalances(
          connection,
          accountKeys.map((k) => new PublicKey(k)),
        );
        const postAccounts = simulation.value.accounts;

        if (postAccounts) {
          for (let i = 0; i < accountKeys.length; i++) {
            const preBalance = preBalances[i];
            const postAccount = postAccounts[i];

            // Account didn't exist before but exists after = new account creation (rent)
            if (
              preBalance === null &&
              postAccount &&
              postAccount.lamports > 0
            ) {
              rentCost = rentCost.add(new BN(postAccount.lamports));
            }
          }
        }
        totalRent = totalRent.add(rentCost);

        // Token transfers: Parse SPL token transfer instructions
        // For a proper estimate, we'd parse the instructions to find transfers
        // For now, we return an empty array as token transfers are complex to parse
        // from simulation alone without full instruction decoding
        const tokenTransfers: TokenAmountOutput[] = [];

        return {
          index,
          computeUnits: simulation.value.unitsConsumed ?? 0,
          success: true,
          costs: {
            transactionFees: solOutput(txFee),
            rent: solOutput(rentCost),
            tokenTransfers,
          },
        };
      }),
    );

    // Aggregate breakdown for token transfers
    const aggregateTokenTransfers: TokenAmountOutput[] = [];
    for (const [mint, amount] of tokenTransfersByMint) {
      if (!amount.isZero()) {
        aggregateTokenTransfers.push(toTokenAmountOutput(amount, mint));
      }
    }

    // SOL total (tx fees + rent)
    const solTotal = totalTransactionFees.add(totalRent);

    return {
      totalSol: solOutput(solTotal),
      breakdown: {
        transactionFees: solOutput(totalTransactionFees),
        rent: solOutput(totalRent),
        tokenTransfers: aggregateTokenTransfers,
      },
      transactions: transactionEstimates,
    };
  },
);

/**
 * Get current balances for accounts (returns null for non-existent accounts).
 */
async function getAccountBalances(
  connection: Connection,
  accounts: PublicKey[],
): Promise<(number | null)[]> {
  const accountInfos = await connection.getMultipleAccountsInfo(accounts);
  return accountInfos.map((info) => (info ? info.lamports : null));
}
