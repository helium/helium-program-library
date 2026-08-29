import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { getTokenDecimals } from "@/lib/constants/tokens";

/**
 * Build the raw transfer instructions. `authority` is the source owner and
 * signs the transfer; `payer` funds the recipient's associated token account
 * when one has to be created and is the transaction's fee payer. They are the
 * same account unless the caller names a separate fee payer. Shared by the
 * direct transfer path (authority = wallet) and the Squads propose path
 * (authority = vault).
 */
export async function buildTransferInstructions({
  connection,
  authority,
  payer,
  destination,
  mint,
  rawAmount,
  isSol,
}: {
  connection: Connection;
  authority: PublicKey;
  payer: PublicKey;
  destination: PublicKey;
  mint: string;
  rawAmount: bigint;
  isSol: boolean;
}): Promise<{ instructions: TransactionInstruction[]; needsAta: boolean }> {
  if (isSol) {
    return {
      instructions: [
        SystemProgram.transfer({
          fromPubkey: authority,
          toPubkey: destination,
          lamports: rawAmount,
        }),
      ],
      needsAta: false,
    };
  }

  const mintKey = new PublicKey(mint);
  const senderAta = getAssociatedTokenAddressSync(mintKey, authority, true);
  const destAta = getAssociatedTokenAddressSync(mintKey, destination, true);
  const [destAtaInfo, decimals] = await Promise.all([
    connection.getAccountInfo(destAta),
    getTokenDecimals(mint),
  ]);
  const needsAta = !destAtaInfo;

  return {
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        destAta,
        destination,
        mintKey
      ),
      createTransferCheckedInstruction(
        senderAta,
        mintKey,
        destAta,
        authority,
        rawAmount,
        decimals
      ),
    ],
    needsAta,
  };
}

/** An account that cannot cover the SOL a transfer charges it. */
export interface SolShortfall {
  message: string;
  required: number;
  available: number;
}

/**
 * Which side of a transfer falls short of its SOL cost, or null when both are
 * covered. `payerLamports` — the transaction fee, any associated-token-account
 * rent and the min-wallet buffer — is charged to the fee payer.
 * `transferLamports` is the native SOL leaving the source authority, 0 for an
 * SPL transfer.
 *
 * `authorityBalance` is the source authority's own balance, and is null
 * whenever nothing is charged to it separately: either the authority is itself
 * the fee payer, or the transfer moves no SOL. Both costs then come off the one
 * balance.
 */
export function transferSolShortfall({
  payerBalance,
  payerLamports,
  transferLamports,
  authorityBalance,
}: {
  payerBalance: number;
  payerLamports: number;
  transferLamports: number;
  authorityBalance: number | null;
}): SolShortfall | null {
  if (authorityBalance === null) {
    const required = payerLamports + transferLamports;
    if (payerBalance >= required) return null;
    return {
      message:
        transferLamports > 0
          ? "Insufficient SOL balance for transfer and transaction fees"
          : "Insufficient SOL balance for transaction fees",
      required,
      available: payerBalance,
    };
  }

  if (payerBalance < payerLamports) {
    return {
      message: "Insufficient SOL balance for transaction fees",
      required: payerLamports,
      available: payerBalance,
    };
  }

  if (authorityBalance < transferLamports) {
    return {
      message: "Insufficient SOL balance for transfer",
      required: transferLamports,
      available: authorityBalance,
    };
  }

  return null;
}
