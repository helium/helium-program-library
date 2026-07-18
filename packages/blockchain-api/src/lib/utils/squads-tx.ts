import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { getTransactionFee } from "@/lib/utils/balance-validation";

/** Fee-shortfall reporter, wired to a procedure's typed INSUFFICIENT_FUNDS error. */
export type InsufficientFundsReporter = (info: {
  required: number;
  available: number;
}) => Error;

/**
 * The subset of a procedure's typed `errors` builders the squads helpers need.
 * The full oRPC `errors` object satisfies this structurally.
 */
export type ProposalErrors = {
  INSUFFICIENT_FUNDS: (opts: {
    message: string;
    data: { required: number; available: number };
  }) => Error;
  NOT_FOUND: (opts: { message: string }) => Error;
};

/**
 * Build an unsigned Squads transaction from a set of instructions, verify the
 * acting member can cover the fee, and return the base64-serialized tx plus the
 * estimated fee in lamports. Version-neutral: used by both the v3 and v4 routers.
 *
 * Passes `addressLookupTableAddresses` through verbatim (default empty) so the
 * common Helium LUT is not auto-attached to these small governance txns; a
 * vault execute supplies the inner message's own lookup tables here.
 */
export async function buildSquadsTransaction({
  connection,
  member,
  instructions,
  addressLookupTableAddresses = [],
  insufficientFunds,
}: {
  connection: Connection;
  member: PublicKey;
  instructions: TransactionInstruction[];
  addressLookupTableAddresses?: PublicKey[];
  insufficientFunds: InsufficientFundsReporter;
}): Promise<{ serializedTransaction: string; feeLamports: number }> {
  const tx = await buildVersionedTransaction({
    connection,
    draft: { instructions, feePayer: member, addressLookupTableAddresses },
  });

  const required = getTransactionFee(tx);
  const available = await connection.getBalance(member);
  if (available < required) {
    throw insufficientFunds({ required, available });
  }

  return {
    serializedTransaction: serializeTransaction(tx),
    feeLamports: required,
  };
}
