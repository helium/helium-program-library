import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { DataCredits } from "@helium/idls/lib/types/data_credits";
import { DC_MINT, HNT_PYTH_PRICE_FEED } from "@helium/spl-utils";
import {
  ComputeBudgetProgram,
  PublicKey,
  Signer,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export async function mintDataCredits({
  dcMint = DC_MINT,
  dcAmount,
  hntAmount,
  program,
  recipient,
}: {
  dcMint?: PublicKey;
  dcAmount?: BN;
  hntAmount?: BN;
  program: Program<DataCredits>;
  recipient?: PublicKey;
}): Promise<{ txs: { tx: VersionedTransaction; signers: Signer[] }[] }> {
  if (!hntAmount && !dcAmount) {
    throw new Error("Either hntAmount or dcAmount must be provided");
  }

  const connection = program.provider.connection;
  const wallet = program.provider.wallet!;

  // The crank keeps HNT_PYTH_PRICE_FEED inside the mint freshness window, so the
  // mint just references it as the price oracle — no ephemeral price update to post.
  const instruction = await program.methods
    .mintDataCreditsV0({
      hntAmount: hntAmount ? hntAmount : null,
      dcAmount: dcAmount ? dcAmount : null,
    })
    .accountsPartial({ dcMint, hntPriceOracle: HNT_PYTH_PRICE_FEED, recipient })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }),
      instruction,
    ],
  }).compileToV0Message();

  return {
    txs: [{ tx: new VersionedTransaction(message), signers: [] }],
  };
}
