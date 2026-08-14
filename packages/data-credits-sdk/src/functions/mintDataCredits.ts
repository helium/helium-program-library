import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { DataCredits } from "@helium/idls/lib/types/data_credits";
import { DC_MINT } from "@helium/spl-utils";
import { dataCreditsKey } from "../pdas";
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

  // The program has_one-pins hnt_price_oracle to the address stored on the
  // DataCreditsV0 account, so read it from chain rather than assuming a feed —
  // this keeps the SDK correct on both sides of the pro-feed flip. The crank
  // keeps that feed inside the mint freshness window; no ephemeral price
  // update to post.
  const [{ hntPriceOracle }, { blockhash }] = await Promise.all([
    program.account.dataCreditsV0.fetch(dataCreditsKey(dcMint)[0]),
    connection.getLatestBlockhash(),
  ]);
  const instruction = await program.methods
    .mintDataCreditsV0({
      hntAmount: hntAmount ? hntAmount : null,
      dcAmount: dcAmount ? dcAmount : null,
    })
    .accountsPartial({ dcMint, hntPriceOracle, recipient })
    .instruction();

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
