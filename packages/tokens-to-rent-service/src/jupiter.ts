import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import { buildFundFeesTransaction, estimateSwapInput } from "./build";
import { JUPITER_API_KEY, JUPITER_API_URL } from "./env";
import { estimateCache, fundFeesStore } from "./reuse";
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

const cachedEstimate = estimateCache(Date.now);
const signOnce = fundFeesStore(Date.now);

export const estimate = ({ mint }: { mint: PublicKey }): Promise<string> =>
  cachedEstimate(mint.toBase58(), () =>
    estimateSwapInput({
      apiUrl: JUPITER_API_URL,
      apiKey: JUPITER_API_KEY,
      mint: mint.toBase58(),
      platformWallet: provider.wallet.publicKey.toBase58(),
    })
  );

/** The serialized, signed fee-funding transaction. */
export const fundFees = ({
  userWallet,
  mint,
}: {
  userWallet: PublicKey;
  mint: PublicKey;
}): Promise<Uint8Array> =>
  signOnce({ wallet: userWallet.toBase58(), mint: mint.toBase58() }, async () =>
    (
      await buildFundFeesTransaction(
        {
          apiUrl: JUPITER_API_URL,
          apiKey: JUPITER_API_KEY,
          mint: mint.toBase58(),
          inputAmount: await estimate({ mint }),
          userWallet: userWallet.toBase58(),
        },
        {
          connection: provider.connection,
          signer: provider.wallet,
          lookupTableAccounts: getAdressLookupTableAccounts,
        }
      )
    ).serialize()
  );
