import {
  AccountMeta,
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { SubscribeUpdateTransactionInfo } from "@triton-one/yellowstone-grpc";
import { provider } from "./solana";

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

export const convertYellowstoneTransaction = async (
  txInfo: SubscribeUpdateTransactionInfo | undefined
): Promise<VersionedTransaction | undefined> => {
  if (!txInfo || !txInfo.transaction || !txInfo.transaction.message)
    return undefined;

  const { meta } = txInfo;
  const { signatures, message } = txInfo.transaction;
  const sigs = signatures.map((sig) => Buffer.from(sig));
  const recentBlockhash = Buffer.from(message.recentBlockhash).toString("hex");
  const accountKeys = [
    ...message.accountKeys,
    ...(meta?.loadedWritableAddresses || []),
    ...(meta?.loadedReadonlyAddresses || []),
  ].map((key) => new PublicKey(key));

  const instructions = message.instructions.map((instr) => {
    const keys: AccountMeta[] = Array.from(instr.accounts).map(
      (accIndex, i) => ({
        pubkey: accountKeys[accIndex],
        isSigner: i < message.header!.numRequiredSignatures,
        isWritable: i < message.header!.numReadonlySignedAccounts,
      })
    );

    return new TransactionInstruction({
      keys,
      programId: accountKeys[instr.programIdIndex],
      data: Buffer.from(instr.data),
    });
  });

  const addressLookupTableAccounts = await getAdressLookupTableAccounts(
    message.addressTableLookups.map((lookup) =>
      new PublicKey(lookup.accountKey).toBase58()
    )
  );

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: provider.wallet.publicKey,
      recentBlockhash,
      instructions,
    }).compileToV0Message(addressLookupTableAccounts)
  );

  tx.signatures = sigs;
  return tx;
};
