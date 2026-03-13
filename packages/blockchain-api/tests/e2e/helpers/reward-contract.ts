import { NATIVE_MINT } from "@solana/spl-token";
import type { TestCtx } from "./context";
import { signAndSubmitTransactionData } from "./tx";

/**
 * Ensures no reward contract exists for the given entity.
 * If a contract exists, it will be deleted.
 */
export async function ensureNoContract(
  ctx: TestCtx,
  entityPubKey: string,
): Promise<void> {
  const { data } = await ctx.safeClient.rewardContract.find({ entityPubKey });
  if (data?.status === "NONE") return;

  const walletAddress = ctx.payer.publicKey.toBase58();
  const { data: deleteData } = await ctx.safeClient.rewardContract.delete({
    entityPubKey,
    signerWalletAddress: walletAddress,
  });

  if (deleteData) {
    await signAndSubmitTransactionData(
      ctx.connection,
      deleteData.unsignedTransactionData,
      ctx.payer,
    );
  }
}

/**
 * Ensures a PENDING reward contract exists for the given entity.
 * Creates one with a CLAIMABLE recipient if none exists.
 */
export async function ensurePendingContract(
  ctx: TestCtx,
  entityPubKey: string,
): Promise<void> {
  const { data } = await ctx.safeClient.rewardContract.find({ entityPubKey });
  if (data?.status === "PENDING") return;

  if (data?.status !== "NONE") {
    await ensureNoContract(ctx, entityPubKey);
  }

  const walletAddress = ctx.payer.publicKey.toBase58();
  const { data: created } = await ctx.safeClient.rewardContract.create({
    entityPubKey,
    signerWalletAddress: walletAddress,
    delegateWalletAddress: walletAddress,
    recipients: [
      {
        type: "CLAIMABLE",
        giftedCurrency: { amount: "1000000", mint: NATIVE_MINT.toBase58() },
        receives: { type: "SHARES", shares: 50 },
      },
      {
        type: "PRESET",
        walletAddress,
        receives: { type: "SHARES", shares: 50 },
      },
    ],
    rewardSchedule: "0 0 1,15 * *",
  });

  if (created) {
    await signAndSubmitTransactionData(
      ctx.connection,
      created.unsignedTransactionData,
      ctx.payer,
    );
  }
}
