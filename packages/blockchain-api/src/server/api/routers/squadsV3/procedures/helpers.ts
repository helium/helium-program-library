import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import { createSolanaConnection } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
  TransactionType,
} from "@/lib/utils/transaction-tags";
import { buildSquadsTransaction, ProposalErrors } from "@/lib/utils/squads-tx";

/**
 * Squads v3 authority index reserved for the multisig's own internal authority.
 * Config-change instructions (addMember / removeMember / changeThreshold)
 * require the multisig account itself as signer, so their wrapping transaction
 * is created under this index.
 */
export const CONFIG_AUTHORITY_INDEX = 0;

/**
 * Instantiate the v3 Squads SDK for a given acting member. The SDK's `build*`
 * methods read `wallet.publicKey` as the member / creator / approver, so the
 * non-signing wallet from `createSolanaConnection` scopes every built
 * instruction to `member`.
 */
export function createSquadsV3(member: string): {
  connection: Connection;
  squads: Squads;
} {
  const { connection, wallet } = createSolanaConnection(member);
  // The SDK types `wallet` as a NodeWallet (with a signing `payer`), but we only
  // call non-signing `build*` methods, which read `wallet.publicKey` alone. The
  // non-signing wallet from createSolanaConnection is sufficient here.
  const squads = new Squads({
    connection,
    wallet: wallet as unknown as ConstructorParameters<
      typeof Squads
    >[0]["wallet"],
  });
  return { connection, squads };
}

/**
 * Per-vote-action descriptor. `type` keys both the tag and the metadata; `verb`
 * is its human-readable label; `buildIx` is the v3 SDK instruction builder for
 * the vote (all v3 vote builders act on the transaction PDA directly).
 */
export type ProposalVoteAction = {
  type: TransactionType;
  verb: string;
  buildIx: (
    squads: Squads,
    multisigPda: PublicKey,
    transactionPda: PublicKey
  ) => Promise<TransactionInstruction>;
};

export const SQUADS_V3_VOTE_ACTIONS = {
  approve: {
    type: TRANSACTION_TYPES.SQUADS_V3_PROPOSAL_APPROVE,
    verb: "Approve",
    buildIx: (squads, multisigPda, transactionPda) =>
      squads.buildApproveTransaction(multisigPda, transactionPda),
  },
  reject: {
    type: TRANSACTION_TYPES.SQUADS_V3_PROPOSAL_REJECT,
    verb: "Reject",
    buildIx: (squads, multisigPda, transactionPda) =>
      squads.buildRejectTransaction(multisigPda, transactionPda),
  },
  cancel: {
    type: TRANSACTION_TYPES.SQUADS_V3_PROPOSAL_CANCEL,
    verb: "Cancel",
    buildIx: (squads, multisigPda, transactionPda) =>
      squads.buildCancelTransaction(multisigPda, transactionPda),
  },
} as const satisfies Record<string, ProposalVoteAction>;

/**
 * Shared body for the v3 approve / reject / cancel endpoints, which differ only
 * in the Squads instruction they build and their labels.
 */
export async function buildProposalVote({
  input,
  connection,
  squads,
  action,
  errors,
}: {
  input: { member: string; multisig: string; transactionPda: string };
  connection: Connection;
  squads: Squads;
  action: ProposalVoteAction;
  errors: ProposalErrors;
}) {
  const member = new PublicKey(input.member);
  const multisigPda = new PublicKey(input.multisig);
  const transactionPda = new PublicKey(input.transactionPda);

  const ix = await action.buildIx(squads, multisigPda, transactionPda);

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
    transactionPda: input.transactionPda,
  });

  return {
    transactions: [
      {
        serializedTransaction,
        metadata: {
          type: action.type,
          description: `${action.verb} transaction ${input.transactionPda}`,
        },
      },
    ],
    parallel: false,
    tag,
    actionMetadata: {
      type: action.type,
      multisig: input.multisig,
      transactionPda: input.transactionPda,
    },
  };
}
