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

export async function convertSubstreamTransaction(txInfo: any): Promise<
  | {
      tx: VersionedTransaction;
      addressLookupTableAccounts: AddressLookupTableAccount[];
    }
  | undefined
> {
  if (!txInfo || !txInfo.transaction || !txInfo.transaction.message) {
    return undefined;
  }

  const { signatures, message } = txInfo.transaction;
  const sigs = signatures.map((sig: string) => decodeBase64ToBuffer(sig));
  const recentBlockhash = decodeBase64ToBuffer(
    message.recentBlockhash
  ).toString("hex");

  const accountKeys = message.accountKeys.map(decodeBase64ToPublicKey);
  accountKeys.forEach((key, idx) => {
    if (!key) {
      throw new Error(`accountKeys[${idx}] is undefined or invalide`);
    }
  });

  let addressLookupTableAccounts: AddressLookupTableAccount[] = [];
  let lookupTableAddresses: string[] = [];
  if (message.addressTableLookups && message.addressTableLookups.length > 0) {
    lookupTableAddresses = message.addressTableLookups.map((lookup: any) =>
      decodeBase64ToPublicKey(lookup.accountKey).toBase58()
    );
    addressLookupTableAccounts = await getAdressLookupTableAccounts(
      lookupTableAddresses
    );
  }

  let extendedAccountKeys = [...accountKeys];
  if (message.addressTableLookups && message.addressTableLookups.length > 0) {
    message.addressTableLookups.forEach((lookup: any, i: number) => {
      const table = addressLookupTableAccounts[i];
      if (!table) {
        throw new Error(`Missing lookup table for index ${i}`);
      }
      const writableIndexes = Array.from(
        decodeBase64ToBuffer(lookup.writableIndexes)
      );
      const readonlyIndexes = Array.from(
        decodeBase64ToBuffer(lookup.readonlyIndexes)
      );
      writableIndexes.forEach((idx) => {
        const addr = table.state.addresses[idx];
        if (!addr)
          throw new Error(
            `No address at writable index ${idx} in lookup table ${i}`
          );
        extendedAccountKeys.push(addr);
      });
      readonlyIndexes.forEach((idx) => {
        const addr = table.state.addresses[idx];
        if (!addr)
          throw new Error(
            `No address at readonly index ${idx} in lookup table ${i}`
          );
        extendedAccountKeys.push(addr);
      });
    });
  }

  const instructions = message.instructions.map(
    (instr: any, instrIdx: number) => {
      const accountIndices: number[] = [];
      if (instr.accounts) {
        const buf = decodeBase64ToBuffer(instr.accounts);
        for (let i = 0; i < buf.length; i++) {
          accountIndices.push(buf[i]);
        }
      }

      const keys: AccountMeta[] = accountIndices.map(
        (accIndex: number, i: number) => {
          if (accIndex < 0 || accIndex >= extendedAccountKeys.length) {
            console.error(
              `Instruction[${instrIdx}] accIndex ${accIndex} out of bounds (extendedAccountKeys.length=${extendedAccountKeys.length})`,
              { accountIndices, extendedAccountKeys, instr }
            );
            throw new Error(
              `Instruction[${instrIdx}] AccountMeta accIndex ${accIndex} out of bounds (extendedAccountKeys.length=${extendedAccountKeys.length})`
            );
          }
          const pubkey = extendedAccountKeys[accIndex];
          if (!pubkey) {
            throw new Error(
              `Instruction[${instrIdx}] AccountMeta pubkey is undefined for accIdx ${accIndex}`
            );
          }

          return {
            pubkey: pubkey,
            isSigner: i < message.header.numRequiredSignatures,
            isWritable: i < message.header.numReadonlySignedAccounts,
          };
        }
      );

      const programId = extendedAccountKeys[instr.programIdIndex];
      if (!programId) {
        throw new Error(
          `Instruction[${instrIdx}] programId is undefined for programIdIndex ${instr.programIdIndex}`
        );
      }

      return new TransactionInstruction({
        keys,
        programId,
        data: decodeBase64ToBuffer(instr.data),
      });
    }
  );

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: provider.wallet.publicKey,
      recentBlockhash,
      instructions,
    }).compileToV0Message(addressLookupTableAccounts)
  );

  tx.signatures = sigs;
  return { tx, addressLookupTableAccounts };
}
