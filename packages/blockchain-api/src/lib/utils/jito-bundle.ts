import type { TransactionDraft } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Jito accepts at most this many transactions in one bundle. */
export const MAX_JITO_BUNDLE_TXS = 5;

export const isJitoCluster = (cluster: string): boolean =>
  cluster === "mainnet" || cluster === "mainnet-beta";

export function shouldUseJitoBundle(
  transactionsLength: number,
  cluster: string,
): boolean {
  return isJitoCluster(cluster) && transactionsLength > 1;
}

/**
 * How many transactions a caller can pack before it adds a dedicated tip
 * transaction. On a Jito cluster one bundle slot stays free for the tip.
 */
export const maxPackedTxs = (cluster: string): number =>
  isJitoCluster(cluster) ? MAX_JITO_BUNDLE_TXS - 1 : MAX_JITO_BUNDLE_TXS;

/**
 * Build the dedicated Jito tip transaction for a bundle. The tip tx copies the
 * blockhash, lookup tables, and version of a packed draft from the same page.
 * The source wallet is added as a read-only signer on the tip instruction, so
 * the tip tx needs the source's signature without a System debit from the
 * source. A source account that carries data, such as a drained wallet turned
 * into a nonce account, fails any System transfer from it. The source holder
 * can still submit the tip tx outside the bundle.
 */
export function buildBundleTipDraft({
  tipIx,
  signer,
  feePayer,
  template,
}: {
  tipIx: TransactionInstruction;
  signer: PublicKey;
  feePayer: PublicKey;
  template: TransactionDraft;
}): TransactionDraft {
  return {
    instructions: [
      new TransactionInstruction({
        programId: tipIx.programId,
        data: tipIx.data,
        keys: [
          ...tipIx.keys,
          { pubkey: signer, isSigner: true, isWritable: false },
        ],
      }),
    ],
    feePayer,
    recentBlockhash: template.recentBlockhash,
    addressLookupTables: template.addressLookupTables,
    addressLookupTableAddresses: template.addressLookupTableAddresses,
    version: template.version,
  };
}
