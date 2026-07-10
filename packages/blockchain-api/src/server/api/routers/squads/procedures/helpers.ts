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
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
  TransactionType,
} from "@/lib/utils/transaction-tags";

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

/** The three fields that identify a specific proposal across squads inputs. */
export type ProposalRef = {
  member: string;
  multisig: string;
  transactionIndex: string;
};

/**
 * Per-vote-action descriptor. `type` is the single transaction type that keys
 * both the tag and the metadata; `verb` is its human-readable label; `buildIx`
 * is the Squads instruction builder for the vote.
 */
export type ProposalVoteAction = {
  type: TransactionType;
  verb: string;
  buildIx: VoteIxBuilder;
};

export const SQUADS_VOTE_ACTIONS = {
  approve: {
    type: TRANSACTION_TYPES.SQUADS_PROPOSAL_APPROVE,
    verb: "Approve",
    buildIx: multisig.instructions.proposalApprove,
  },
  reject: {
    type: TRANSACTION_TYPES.SQUADS_PROPOSAL_REJECT,
    verb: "Reject",
    buildIx: multisig.instructions.proposalReject,
  },
  cancel: {
    type: TRANSACTION_TYPES.SQUADS_PROPOSAL_CANCEL,
    verb: "Cancel",
    buildIx: multisig.instructions.proposalCancel,
  },
} as const satisfies Record<string, ProposalVoteAction>;

/**
 * Shared body for the approve / reject / cancel proposal endpoints, which
 * differ only in the Squads instruction they build and their labels.
 */
export async function buildProposalVote({
  input,
  connection,
  action,
  errors,
}: {
  input: ProposalRef & { memo?: string };
  connection: Connection;
  action: ProposalVoteAction;
  errors: ProposalErrors;
}) {
  const member = new PublicKey(input.member);
  const multisigPda = new PublicKey(input.multisig);

  const ix = action.buildIx({
    multisigPda,
    transactionIndex: BigInt(input.transactionIndex),
    member,
    memo: input.memo,
  });

  const { serializedTransaction } = await buildSquadsTransaction({
    connection,
    member,
    instructions: [ix],
    insufficientFunds: ({ required, available }) =>
      errors.INSUFFICIENT_FUNDS({
        message: `Insufficient SOL balance to ${action.verb.toLowerCase()} the proposal`,
        data: { required, available },
      }),
  });

  const tag = generateTransactionTag({
    type: action.type,
    member: input.member,
    multisig: input.multisig,
    transactionIndex: input.transactionIndex,
  });

  return {
    transactions: [
      {
        serializedTransaction,
        metadata: {
          type: action.type,
          description: `${action.verb} proposal #${input.transactionIndex}`,
        },
      },
    ],
    parallel: false,
    tag,
    actionMetadata: {
      type: action.type,
      multisig: input.multisig,
      transactionIndex: input.transactionIndex,
    },
  };
}

/**
 * The shared response envelope for an action endpoint's propose mode: one
 * serialized proposal transaction, display metadata, and actionMetadata keyed
 * by the proposal's transaction type. `metadata` / `actionMetadata` carry the
 * endpoint-specific extra fields for each record.
 */
export function proposalTransactionData({
  serializedTransaction,
  type,
  description,
  tag,
  multisig,
  transactionIndex,
  metadata = {},
  actionMetadata = metadata,
}: {
  serializedTransaction: string;
  type: TransactionType;
  description: string;
  tag: string;
  multisig: string;
  transactionIndex: string;
  metadata?: Record<string, unknown>;
  actionMetadata?: Record<string, unknown>;
}) {
  return {
    transactions: [
      {
        serializedTransaction,
        metadata: { type, description, ...metadata },
      },
    ],
    parallel: false,
    tag,
    actionMetadata: { type, multisig, transactionIndex, ...actionMetadata },
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
  errors,
  action,
}: {
  connection: Connection;
  multisigPda: PublicKey;
  member: PublicKey;
  buildInstructions: (
    vault: PublicKey
  ) => Promise<TransactionInstruction[]> | TransactionInstruction[];
  memo?: string;
  errors: ProposalErrors;
  /** Noun for the insufficient-funds message: "create the ${action} proposal". */
  action: string;
}): Promise<{
  serializedTransaction: string;
  transactionIndex: string;
  feeLamports: number;
}> {
  const transactionIndex = await nextTransactionIndex(
    connection,
    multisigPda
  ).catch(() => {
    throw errors.NOT_FOUND({
      message: `Multisig ${multisigPda.toBase58()} not found`,
    });
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
    insufficientFunds: ({ required, available }) =>
      errors.INSUFFICIENT_FUNDS({
        message: `Insufficient SOL balance to create the ${action} proposal`,
        data: { required, available },
      }),
  });
  return {
    serializedTransaction,
    transactionIndex: transactionIndex.toString(),
    feeLamports,
  };
}
