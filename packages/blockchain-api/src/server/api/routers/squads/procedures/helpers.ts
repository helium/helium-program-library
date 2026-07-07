import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import { generateTransactionTag } from "@/lib/utils/transaction-tags";

/** Fee-shortfall reporter, wired to a procedure's typed INSUFFICIENT_FUNDS error. */
export type InsufficientFundsReporter = (info: {
  required: number;
  available: number;
}) => Error;

/**
 * Build an unsigned Squads transaction from a set of instructions, verify the
 * acting member can cover the fee, and return the base64-serialized tx plus the
 * estimated fee in lamports.
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

type VoteIxBuilder = (args: {
  multisigPda: PublicKey;
  transactionIndex: bigint;
  member: PublicKey;
  memo?: string;
}) => TransactionInstruction;

/**
 * Shared body for the approve / reject / cancel proposal endpoints, which
 * differ only in the Squads instruction they build and their labels.
 */
export async function buildProposalVote({
  input,
  connection,
  buildIx,
  tagType,
  metaType,
  verb,
  insufficientFunds,
}: {
  input: {
    member: string;
    multisig: string;
    transactionIndex: string;
    memo?: string;
  };
  connection: Connection;
  buildIx: VoteIxBuilder;
  tagType: string;
  metaType: string;
  verb: string;
  insufficientFunds: InsufficientFundsReporter;
}) {
  const member = new PublicKey(input.member);
  const multisigPda = new PublicKey(input.multisig);

  const ix = buildIx({
    multisigPda,
    transactionIndex: BigInt(input.transactionIndex),
    member,
    memo: input.memo,
  });

  const { serializedTransaction } = await buildSquadsTransaction({
    connection,
    member,
    instructions: [ix],
    insufficientFunds,
  });

  const tag = generateTransactionTag({
    type: tagType,
    member: input.member,
    multisig: input.multisig,
    transactionIndex: input.transactionIndex,
  });

  return {
    transactions: [
      {
        serializedTransaction,
        metadata: {
          type: metaType,
          description: `${verb} proposal #${input.transactionIndex}`,
        },
      },
    ],
    parallel: false,
    tag,
    actionMetadata: {
      type: metaType,
      multisig: input.multisig,
      transactionIndex: input.transactionIndex,
    },
  };
}

/** Fetch the multisig's next (unused) transaction index. */
export async function nextTransactionIndex(
  connection: Connection,
  multisigPda: PublicKey
): Promise<bigint> {
  const info = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );
  return BigInt(info.transactionIndex.toString()) + BigInt(1);
}

/** Default vault (index 0) of a multisig — the authority for proposed actions. */
export function vaultPda(multisigPda: PublicKey): PublicKey {
  return multisig.getVaultPda({ multisigPda, index: 0 })[0];
}

/**
 * Wrap action instructions (built with the vault as their authority) into a
 * Squads v4 vault-transaction proposal: vaultTransactionCreate + proposalCreate,
 * both created and paid for by `member`. This is the "build as proposal" mode
 * of the action endpoints, mirroring the wallet's propose_ixs_with_luts.
 *
 * Pure/synchronous: resolve `transactionIndex` via nextTransactionIndex first so
 * a missing multisig maps to NOT_FOUND before any instruction is built.
 */
export function wrapAsVaultProposal({
  multisigPda,
  transactionIndex,
  member,
  vault,
  instructions,
  memo,
  addressLookupTableAccounts = [],
}: {
  multisigPda: PublicKey;
  transactionIndex: bigint;
  member: PublicKey;
  vault: PublicKey;
  instructions: TransactionInstruction[];
  memo?: string;
  addressLookupTableAccounts?: AddressLookupTableAccount[];
}): TransactionInstruction[] {
  const transactionMessage = new TransactionMessage({
    payerKey: vault,
    // Placeholder blockhash: Squads stores the inner message, not a live tx.
    recentBlockhash: PublicKey.default.toBase58(),
    instructions,
  });

  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: member,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage,
    addressLookupTableAccounts,
    memo,
  });
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    creator: member,
    transactionIndex,
  });

  return [createIx, proposalIx];
}

/**
 * Full "build as proposal" path for an action endpoint: resolve the next
 * transaction index (mapping a missing multisig to the caller's NOT_FOUND),
 * build the action instructions with the vault as authority, wrap them into a
 * proposal, and produce the base64 outer transaction paid for by `member`.
 *
 * `buildInstructions` receives the vault pubkey to use as the action's
 * authority/owner. Returns the serialized proposal transaction and the assigned
 * transaction index (as a string, for metadata).
 */
export async function buildActionProposal({
  connection,
  multisigPda,
  member,
  buildInstructions,
  memo,
  insufficientFunds,
  notFound,
}: {
  connection: Connection;
  multisigPda: PublicKey;
  member: PublicKey;
  buildInstructions: (
    vault: PublicKey
  ) => Promise<TransactionInstruction[]> | TransactionInstruction[];
  memo?: string;
  insufficientFunds: InsufficientFundsReporter;
  notFound: () => Error;
}): Promise<{
  serializedTransaction: string;
  transactionIndex: string;
  feeLamports: number;
}> {
  const transactionIndex = await nextTransactionIndex(
    connection,
    multisigPda
  ).catch(() => {
    throw notFound();
  });
  const vault = vaultPda(multisigPda);
  const instructions = await buildInstructions(vault);
  const proposalIxs = wrapAsVaultProposal({
    multisigPda,
    transactionIndex,
    member,
    vault,
    instructions,
    memo,
  });
  const { serializedTransaction, feeLamports } = await buildSquadsTransaction({
    connection,
    member,
    instructions: proposalIxs,
    insufficientFunds,
  });
  return {
    serializedTransaction,
    transactionIndex: transactionIndex.toString(),
    feeLamports,
  };
}
