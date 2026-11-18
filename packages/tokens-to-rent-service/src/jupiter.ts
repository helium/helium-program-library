import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import { buildFundFeesTransaction, estimateSwapInput } from "./build";
import { JUPITER_API_KEY, JUPITER_API_URL } from "./env";
import { createService } from "./service";
import { provider } from "./solana";

export const getAdressLookupTableAccounts = async (
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

export const { estimate, fundFees } = createService({
  estimateSwapInput,
  buildFundFeesTransaction,
  connection: provider.connection,
  signer: provider.wallet,
  lookupTableAccounts: getAdressLookupTableAccounts,
  now: Date.now,
  apiUrl: JUPITER_API_URL,
  apiKey: JUPITER_API_KEY,
});
