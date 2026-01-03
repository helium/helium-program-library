import {
  AddressLookupTableAccount, ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const BATCH_ADD_MAX_SIZE_CHECK = 1100;
const PRIORITY_FEES = 50000;
const SQUADS_PROGRAM_ID = multisig.PROGRAM_ID;

// this uses dummy keys, merely to see if the size goes above the limit
const calculateSerializedTxSize = (
  addressLookupTableAccounts: AddressLookupTableAccount[],
  transactionMessage: TransactionMessage
): number => {
  try {
    const batchAddTx = createBatchAddSingleTransaction({
      blockhash: PublicKey.default.toBase58(),
      proposer: PublicKey.default,
      rentPayer: PublicKey.default,
      squadAddress: PublicKey.default,
      transactionIndex: 0,
      batchIndex: BigInt(0),
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: {
        // create a new one since we will actually have a fee priority compute ix in each tx
        message: new TransactionMessage({
          payerKey: PublicKey.default,
          recentBlockhash: PublicKey.default.toBase58(),
          instructions: transactionMessage.instructions,
        }),
        addressLookupTableAccounts,
      },
    });
    return batchAddTx.serialize().length;
  } catch (e) {
    console.error("Size exceeded in preparation");
    return BATCH_ADD_MAX_SIZE_CHECK + 1; // Assume it exceeds max size to handle error
  }
};

const tryAddBucket = (
  message: TransactionMessage,
  bucket: TransactionInstruction[],
  addressLookupTableAccounts: AddressLookupTableAccount[]
): boolean => {
  const originalInstructions = [...message.instructions];
  message.instructions = [...message.instructions, ...bucket];
  if (
    calculateSerializedTxSize(addressLookupTableAccounts, message) >
    BATCH_ADD_MAX_SIZE_CHECK
  ) {
    message.instructions = originalInstructions; // Revert if exceeds limit
    return false;
  }
  return true;
};

export interface PackagedBatchedInstructionsResult {
  transactionMessages: TransactionMessage[];
  failedBuckets: number[];
  bucketTxMessageIndexes: Array<number>;
}

// function takes an array of arrays, with each have a collection of instructions (that may need to be executed together to represent a single tx)
// ie [[ix1_requirement, ix1_requirement, ix1], [ix2_requirement, ix3_requirement, ix3]...]
// if there are no atomic requirements, this can simply be a list [[ix1], [ix2], [ix3]]
export const packageInstructions = (
  instructionsBuckets: TransactionInstruction[][],
  addressLookupTableAccounts: AddressLookupTableAccount[],
  feePayer: PublicKey
): PackagedBatchedInstructionsResult => {
  const transactionMessages: TransactionMessage[] = [];
  const failedBuckets: number[] = [];
  const bucketTxMessageIndexes: Array<number> = [];

  // the initial message to add instructions to
  let currentMessage = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: PublicKey.default.toBase58(),
    instructions: [],
  });

  instructionsBuckets.forEach((bucket, index) => {
    // if bucket does not have any instructions, skip it
    if (bucket.length === 0) {
      failedBuckets.push(index);
      bucketTxMessageIndexes.push(-1);
      return;
    }

    if (!tryAddBucket(currentMessage, bucket, addressLookupTableAccounts)) {
      // Attempt to add the current bucket to the message failed due to size constraints
      if (currentMessage.instructions.length > 0) {
        transactionMessages.push(currentMessage); // Save the message if it has any instructions
      }

      // Create a new message for the next attempt
      currentMessage = new TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: PublicKey.default.toBase58(),
        instructions: [],
      });

      // Try adding the bucket to the new message to see if it fits
      if (!tryAddBucket(currentMessage, bucket, addressLookupTableAccounts)) {
        // If the bucket alone exceeds the max size, mark it as failed
        failedBuckets.push(index);
        bucketTxMessageIndexes.push(-1);
      } else {
        // If the bucket is successfully added, record its message index
        bucketTxMessageIndexes.push(transactionMessages.length);
      }
    } else {
      // The bucket was added successfully to the current message
      bucketTxMessageIndexes.push(transactionMessages.length);
    }
  });

  if (currentMessage.instructions.length > 0) {
    transactionMessages.push(currentMessage); // Ensure the last message is added
  }

  return { transactionMessages, failedBuckets, bucketTxMessageIndexes };
};

// for prexisting batch drafts - this is a solo transaction to create the ix to attach
// a single tx to a batch
// IMPORTANT! batchIndex is the actual proposal/transaction index, and transactionIndex is the
// batch TX themselves!
export function createBatchAddSingleTransaction({
  blockhash,
  proposer,
  rentPayer,
  squadAddress,
  transactionIndex,
  vaultIndex,
  batchIndex,
  ephemeralSigners,
  transactionMessage,
  fees,
}: {
  blockhash: string;
  proposer: PublicKey;
  rentPayer: PublicKey;
  squadAddress: PublicKey;
  transactionIndex: number;
  batchIndex: bigint;
  vaultIndex: number;
  ephemeralSigners: number;
  transactionMessage: {
    message: TransactionMessage;
    addressLookupTableAccounts: AddressLookupTableAccount[];
  };
  fees?: number;
}): VersionedTransaction {
  const batchIx = multisig.instructions.batchAddTransaction({
    vaultIndex,
    multisigPda: new PublicKey(squadAddress),
    member: proposer,
    rentPayer,
    batchIndex,
    transactionIndex,
    ephemeralSigners,
    transactionMessage: transactionMessage.message,
    addressLookupTableAccounts: transactionMessage.addressLookupTableAccounts,
    programId: SQUADS_PROGRAM_ID,
  });

  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: rentPayer ?? proposer,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: fees || PRIORITY_FEES,
        }),
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 100_000,
        }),
        batchIx,
      ],
    }).compileToV0Message(transactionMessage.addressLookupTableAccounts)
  );
}