import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  getAddressLookupTableAccounts,
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  populateMissingDraftInfo,
  prependComputeBudgetIxs,
  tableComputeUnitsForInstructions,
  toVersionedTx,
  withPriorityFees,
} from "@helium/spl-utils";
import BN from "bn.js";
import { env } from "@/lib/env";
import {
  calculateRequiredBalance,
  getTransactionFee,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";

export function getHeliumLookupTable(): PublicKey {
  return env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
    ? HELIUM_COMMON_LUT_DEVNET
    : HELIUM_COMMON_LUT;
}

export interface TransactionDraft {
  instructions: TransactionInstruction[];
  feePayer: PublicKey;
  addressLookupTableAddresses?: PublicKey[];
}

export interface BuildTransactionOptions {
  connection: Connection;
  draft: TransactionDraft;
  signers?: Keypair[];
}

export async function buildVersionedTransaction({
  connection,
  draft,
  signers = [],
}: BuildTransactionOptions): Promise<VersionedTransaction> {
  const draftWithLuts = {
    ...draft,
    addressLookupTableAddresses: draft.addressLookupTableAddresses ?? [
      getHeliumLookupTable(),
    ],
  };

  // withPriorityFees doesn't need a blockhash (simulation replaces it), so
  // fetch it concurrently with fee/CU estimation. Observe now so an early
  // throw below doesn't leave an unhandled rejection.
  const blockhashPromise = connection.getLatestBlockhash("finalized");
  blockhashPromise.catch(() => {});

  let instructionsWithFees: TransactionInstruction[];
  let addressLookupTables: AddressLookupTableAccount[] | undefined;
  try {
    // Resolve LUTs once; withPriorityFees and the compile below both skip
    // their own fetch when addressLookupTables is already populated.
    addressLookupTables = await getAddressLookupTableAccounts(
      connection,
      draftWithLuts.addressLookupTableAddresses
    );
    instructionsWithFees = await withPriorityFees({
      ...draftWithLuts,
      addressLookupTables,
      connection,
    });
  } catch (error) {
    console.warn(
      "[buildVersionedTransaction] Priority fee estimation failed, using CU table fallback:",
      error
    );
    instructionsWithFees = prependComputeBudgetIxs(draftWithLuts.instructions, {
      computeUnits: tableComputeUnitsForInstructions(
        draftWithLuts.instructions
      ),
      // Floor price, matching withPriorityFees' basePriorityFee default —
      // no network path left to estimate a real one.
      microLamports: 1,
      // No simulation validated a data-size ceiling here, so set no limit
      // and let the runtime's 64 MiB default apply — degrade to overpaying,
      // never to an on-chain size failure.
    });
  }

  let tx: VersionedTransaction;
  try {
    tx = toVersionedTx(
      await populateMissingDraftInfo(
        connection,
        {
          ...draftWithLuts,
          addressLookupTables,
          instructions: instructionsWithFees,
          recentBlockhash: (await blockhashPromise).blockhash,
        },
        "finalized"
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("encoding overruns")) {
      throw new Error(
        `Transaction too large to serialize (${instructionsWithFees.length} instructions). Split into smaller batches.`
      );
    }
    throw error;
  }

  if (signers.length > 0) {
    tx.sign(signers);
  }

  return tx;
}

export function serializeTransaction(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}

/**
 * Shared tail for the direct (non-Squads) single-transaction endpoints: build
 * the unsigned tx, verify the fee payer can cover the fee plus rent and the
 * min-wallet buffer, and return the standard `{ transactionData, estimatedSolFee }`
 * envelope. Mirrors `buildAutomationTransactionResponse` for the single-tx case.
 *
 * Only for endpoints whose required balance is exactly
 * `calculateRequiredBalance(fee, rentLamports)` and whose reported fee is that
 * same amount; endpoints that add a transfer amount or report a different fee
 * build their response inline.
 */
export async function buildSingleTransactionResponse({
  connection,
  instructions,
  feePayer,
  addressLookupTableAddresses,
  rentLamports = 0,
  insufficientFundsMessage,
  errors,
  tag,
  transactionMetadata,
  actionMetadata,
}: {
  connection: Connection;
  instructions: TransactionInstruction[];
  feePayer: PublicKey;
  addressLookupTableAddresses?: PublicKey[];
  rentLamports?: number;
  insufficientFundsMessage: string;
  errors: {
    INSUFFICIENT_FUNDS: (opts: {
      message: string;
      data: { required: number; available: number };
    }) => Error;
  };
  tag: string;
  transactionMetadata: {
    type: string;
    description: string;
    [key: string]: unknown;
  };
  actionMetadata: Record<string, unknown>;
}) {
  const tx = await buildVersionedTransaction({
    connection,
    draft: { instructions, feePayer, addressLookupTableAddresses },
  });

  const required = calculateRequiredBalance(
    await getTransactionFee(connection, tx),
    rentLamports
  );
  const available = await connection.getBalance(feePayer);
  if (available < required) {
    throw errors.INSUFFICIENT_FUNDS({
      message: insufficientFundsMessage,
      data: { required, available },
    });
  }

  return {
    transactionData: {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: transactionMetadata,
        },
      ],
      parallel: false,
      tag,
      actionMetadata,
    },
    estimatedSolFee: await toTokenAmountOutput(
      new BN(required),
      NATIVE_MINT.toBase58()
    ),
  };
}
