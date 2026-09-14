import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

export interface TransactionDataLike {
  transactions: Array<{
    serializedTransaction: string;
    metadata?: { [key: string]: any };
  }>;
  parallel: boolean;
  tag?: string;
}

export async function signAndSubmitTransactionData(
  connection: Connection,
  txData: TransactionDataLike,
  signer: Keypair
): Promise<string[]> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const signatures: string[] = [];
  let signedAny = false;
  for (const t of txData.transactions) {
    const tx = VersionedTransaction.deserialize(
      Buffer.from(t.serializedTransaction, "base64")
    );
    const hasExistingSignatures = tx.signatures.some((sig) =>
      sig.some((byte) => byte !== 0)
    );
    if (!hasExistingSignatures) {
      tx.message.recentBlockhash = blockhash;
    }
    // Only sign txs that list this key as a required signer; a server-signed
    // fee-payer-only tx in the batch would otherwise make web3.js throw.
    const requiredSigners = tx.message.staticAccountKeys.slice(
      0,
      tx.message.header.numRequiredSignatures
    );
    if (requiredSigners.some((k) => k.equals(signer.publicKey))) {
      tx.sign([signer]);
      signedAny = true;
    }
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    signatures.push(sig);
  }
  // A batch that never needed the caller's key would otherwise submit
  // happily and read as coverage of a signature the route no longer asks for.
  if (txData.transactions.length > 0 && !signedAny) {
    throw new Error(
      `signAndSubmitTransactionData: no tx required ${signer.publicKey.toBase58()}; ` +
        "the batch was entirely server-signed"
    );
  }
  return signatures;
}

export async function sendAndConfirmInstructions(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[]
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  instructions.forEach((ix) => tx.add(ix));
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}
