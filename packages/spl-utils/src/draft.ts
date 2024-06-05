import { AddressLookupTableAccount, Connection, PublicKey, Signer, TransactionInstruction } from "@solana/web3.js";
import { getAddressLookupTableAccounts } from "./transaction";

export type TransactionDraft = {
  recentBlockhash?: string;
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
  addressLookupTableAddresses?: PublicKey[];
  // Result from loooking up lookup table addresses
  addressLookupTables?: AddressLookupTableAccount[];
  signers?: Signer[];
};

export async function populateMissingDraftInfo(
  connection: Connection,
  tx: TransactionDraft
): Promise<TransactionDraft> {
  if (!tx.addressLookupTables) {
    tx.addressLookupTables = await getAddressLookupTableAccounts(
      connection,
      tx.addressLookupTableAddresses || []
    );
  }

  if (!tx.recentBlockhash) {
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  }

  return tx;
}