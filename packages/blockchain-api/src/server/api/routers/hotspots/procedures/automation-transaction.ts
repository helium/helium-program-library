import * as anchor from "@coral-xyz/anchor";
import { cronJobKey, init as initCron } from "@helium/cron-sdk";
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { getHeliumLookupTable } from "@/lib/utils/build-transaction";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";

/**
 * Resolve the single entity-claim cron job for a wallet: set up the provider,
 * init the hpl-crons and cron programs, and load the wallet's cron job (index 0
 * under its entity-cron authority). Throws the caller's NOT_FOUND when no
 * automation exists yet.
 */
export const resolveEntityClaimCronJob = async ({
  walletAddress,
  notFoundMessage,
  errors,
}: {
  walletAddress: string;
  notFoundMessage: string;
  errors: { NOT_FOUND: (opts: { message: string }) => Error };
}) => {
  const wallet = new PublicKey(walletAddress);
  const { provider } = createSolanaConnection(walletAddress);
  anchor.setProvider(provider);

  const [hplCronsProgram, cronProgram] = await Promise.all([
    initHplCrons(provider),
    initCron(provider),
  ]);

  const authority = entityCronAuthorityKey(wallet)[0];
  const cronJob = cronJobKey(authority, 0)[0];

  const cronJobAccount = await cronProgram.account.cronJobV0.fetchNullable(
    cronJob
  );
  if (!cronJobAccount) {
    throw errors.NOT_FOUND({ message: notFoundMessage });
  }

  return {
    wallet,
    provider,
    hplCronsProgram,
    authority,
    cronJob,
    cronJobAccount,
  };
};

/**
 * Shared tail for the claim-automation transaction endpoints. They differ only
 * in the instructions they build and the tag/metadata they attach; the batching
 * (common LUT, 500k CU limit, finalized commitment), Jito tip, base64 encoding,
 * fee total, and response envelope are identical. `extraFeeLamports` covers
 * lamports the transaction actually moves (e.g. operator top-ups) so the
 * estimated fee reflects the caller's total SOL outlay.
 */
export const buildAutomationTransactionResponse = async ({
  provider,
  instructions,
  feePayer,
  tag,
  transactionMetadata,
  actionMetadata,
  extraFeeLamports = 0,
}: {
  provider: anchor.AnchorProvider;
  instructions: TransactionInstruction[];
  feePayer: PublicKey;
  tag: string;
  transactionMetadata: {
    type: string;
    description: string;
    [key: string]: unknown;
  };
  actionMetadata: Record<string, unknown>;
  extraFeeLamports?: number;
}) => {
  const vtxs = (
    await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
      addressLookupTableAddresses: [getHeliumLookupTable()],
      computeUnitLimit: 500000,
      commitment: "finalized",
    })
  ).map((tx) => toVersionedTx(tx));

  if (shouldUseJitoBundle(vtxs.length, getCluster())) {
    vtxs.push(await getJitoTipTransaction(feePayer));
  }

  const txs = vtxs.map((tx) => Buffer.from(tx.serialize()).toString("base64"));
  const txFees = getTotalTransactionFees(vtxs);

  return {
    transactionData: {
      transactions: txs.map((serialized) => ({
        serializedTransaction: serialized,
        metadata: transactionMetadata,
      })),
      parallel: false,
      tag,
      actionMetadata,
    },
    estimatedSolFee: await toTokenAmountOutput(
      new BN(txFees + extraFeeLamports),
      NATIVE_MINT.toBase58()
    ),
  };
};
