import {
  AccountMeta,
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { provider } from "./solana";

const decodeBase64ToBuffer = (str: string): Buffer => {
  return Buffer.from(str, "base64");
};

const decodeBase64ToPublicKey = (str: string): PublicKey => {
  return new PublicKey(decodeBase64ToBuffer(str));
};

const getAdressLookupTableAccounts = async (
  keys: string[]
): Promise<AddressLookupTableAccount[]> => {
  const connection = provider.connection;
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
};

export async function convertSubstreamTransaction(
  txInfo: any
): Promise<VersionedTransaction | undefined> {
  if (!txInfo || !txInfo.transaction || !txInfo.transaction.message) {
    return undefined;
  }

  const { signatures, message } = txInfo.transaction;
  const sigs = signatures.map((sig: string) => decodeBase64ToBuffer(sig));
  const recentBlockhash = decodeBase64ToBuffer(
    message.recentBlockhash
  ).toString("hex");

  const accountKeys = message.accountKeys.map(decodeBase64ToPublicKey);
  const instructions = message.instructions.map((instr: any) => {
    const accountIndices: number[] = [];
    if (instr.accounts) {
      const buf = decodeBase64ToBuffer(instr.accounts);
      for (let i = 0; i < buf.length; i++) {
        accountIndices.push(buf[i]);
      }
    }

    const keys: AccountMeta[] = accountIndices.map(
      (accIndex: number, i: number) => ({
        pubkey: accountKeys[accIndex],
        isSigner: i < message.header.numRequiredSignatures,
        isWritable: i < message.header.numReadonlySignedAccounts,
      })
    );

    return new TransactionInstruction({
      keys,
      programId: accountKeys[instr.programIdIndex],
      data: decodeBase64ToBuffer(instr.data),
    });
  });

  let addressLookupTableAccounts: AddressLookupTableAccount[] = [];
  if (message.addressTableLookups && message.addressTableLookups.length > 0) {
    const lookupTableAddresses = message.addressTableLookups.map(
      (lookup: any) => decodeBase64ToPublicKey(lookup.accountKey).toBase58()
    );
    addressLookupTableAccounts = await getAdressLookupTableAccounts(
      lookupTableAddresses
    );
  }

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: provider.wallet.publicKey,
      recentBlockhash,
      instructions,
    }).compileToV0Message(addressLookupTableAccounts)
  );

  tx.signatures = sigs;
  return tx;
}
