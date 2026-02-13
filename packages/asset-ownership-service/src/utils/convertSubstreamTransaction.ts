import {
  AddressLookupTableAccount,
  PublicKey,
} from "@solana/web3.js";
import { provider } from "./solana";
import { ProcessableInstruction } from "./processTransaction";

const decodeBase64ToBuffer = (str: string): Buffer => {
  return Buffer.from(str, "base64");
};

const decodeBase64ToPublicKey = (str: string): PublicKey => {
  return new PublicKey(decodeBase64ToBuffer(str));
};

const getAddressLookupTableAccounts = async (
  keys: string[]
): Promise<Map<string, AddressLookupTableAccount>> => {
  const connection = provider.connection;
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  const result = new Map<string, AddressLookupTableAccount>();
  addressLookupTableAccountInfos.forEach((accountInfo, index) => {
    const address = keys[index];
    if (accountInfo) {
      result.set(
        address,
        new AddressLookupTableAccount({
          key: new PublicKey(address),
          state: AddressLookupTableAccount.deserialize(accountInfo.data),
        })
      );
    } else {
      console.warn(`Lookup table ${address} returned null from RPC`);
    }
  });

  return result;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function convertSubstreamTransaction(txInfo: any): Promise<
  | {
      accountKeys: PublicKey[];
      instructions: ProcessableInstruction[];
    }
  | undefined
> {
  if (!txInfo || !txInfo.transaction || !txInfo.transaction.message) {
    console.warn("convertSubstreamTransaction: malformed input", {
      hasTxInfo: !!txInfo,
      hasTransaction: !!txInfo?.transaction,
      hasMessage: !!txInfo?.transaction?.message,
    });
    return undefined;
  }

  const { message } = txInfo.transaction;

  const accountKeys = message.accountKeys.map(decodeBase64ToPublicKey);
  accountKeys.forEach((key: PublicKey, idx: number) => {
    if (!key) {
      throw new Error(`accountKeys[${idx}] is undefined or invalid`);
    }
  });

  let extendedAccountKeys = [...accountKeys];
  if (message.addressTableLookups && message.addressTableLookups.length > 0) {
    const lookupTableAddresses = message.addressTableLookups.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lookup: any) => decodeBase64ToPublicKey(lookup.accountKey).toBase58()
    );
    const lookupTableMap = await getAddressLookupTableAccounts(lookupTableAddresses);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message.addressTableLookups.forEach((lookup: any) => {
      const tableAddress = decodeBase64ToPublicKey(
        lookup.accountKey
      ).toBase58();
      const table = lookupTableMap.get(tableAddress);
      if (!table) {
        throw new Error(`Missing lookup table ${tableAddress}`);
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
            `No address at writable index ${idx} in lookup table ${tableAddress}`
          );
        extendedAccountKeys.push(addr);
      });
      readonlyIndexes.forEach((idx) => {
        const addr = table.state.addresses[idx];
        if (!addr)
          throw new Error(
            `No address at readonly index ${idx} in lookup table ${tableAddress}`
          );
        extendedAccountKeys.push(addr);
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instructions: ProcessableInstruction[] = message.instructions.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instr: any, instrIdx: number) => {
      const accountKeyIndexes: number[] = [];
      if (instr.accounts) {
        const buf = decodeBase64ToBuffer(instr.accounts);
        for (let i = 0; i < buf.length; i++) {
          accountKeyIndexes.push(buf[i]);
        }
      }

      for (const accIndex of accountKeyIndexes) {
        if (accIndex < 0 || accIndex >= extendedAccountKeys.length) {
          throw new Error(
            `Instruction[${instrIdx}] accountKeyIndex ${accIndex} out of bounds (extendedAccountKeys.length=${extendedAccountKeys.length})`
          );
        }
      }

      return {
        programIdIndex: instr.programIdIndex,
        accountKeyIndexes,
        data: decodeBase64ToBuffer(instr.data),
      };
    }
  );

  return { accountKeys: extendedAccountKeys, instructions };
}
