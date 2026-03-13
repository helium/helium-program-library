import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  populateMissingDraftInfo,
  toVersionedTx,
  withPriorityFees,
} from "@helium/spl-utils";
import { env } from "@/lib/env";

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

  let instructionsWithFees: TransactionInstruction[];
  try {
    instructionsWithFees = await withPriorityFees({
      ...draftWithLuts,
      connection,
    });
  } catch (error) {
    console.warn(
      "[buildVersionedTransaction] Priority fee estimation failed, using default instructions:",
      error,
    );
    instructionsWithFees = draftWithLuts.instructions;
  }

  let tx: VersionedTransaction;
  try {
    tx = toVersionedTx(
      await populateMissingDraftInfo(
        connection,
        { ...draftWithLuts, instructions: instructionsWithFees },
        "finalized",
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("encoding overruns")) {
      throw new Error(
        `Transaction too large to serialize (${instructionsWithFees.length} instructions). Split into smaller batches.`,
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
