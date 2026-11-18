import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { ACCOUNT_SIZE } from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ESTIMATE_LAMPORTS,
  MAX_COMPUTE_UNIT_LIMIT,
  MIN_FUND_FEES_OUT_LAMPORTS,
  buildFundFeesSwap,
  buildJupiterSwap,
  estimateRequest,
  planComputeBudget,
  repayLamports,
} from "./build";
import { JUPITER_API_KEY, JUPITER_API_URL } from "./env";
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

export const estimate = async ({
  mint,
}: {
  mint: PublicKey;
}): Promise<string> => {
  if (
    ![
      HNT_MINT.toBase58(),
      IOT_MINT.toBase58(),
      MOBILE_MINT.toBase58(),
    ].includes(mint.toBase58())
  ) {
    throw new Error(
      `Provided mint not supported by service: ${mint.toBase58()}`
    );
  }

  // /build has no quote-only form, so the price comes from a build for the platform wallet,
  // whose instructions are discarded.
  const quote = await buildJupiterSwap(
    estimateRequest({
      apiUrl: JUPITER_API_URL,
      apiKey: JUPITER_API_KEY,
      mint: mint.toBase58(),
      solAmount: ESTIMATE_LAMPORTS.toString(),
      platformWallet: provider.wallet.publicKey.toBase58(),
    })
  );

  return quote.outAmount;
};

export const fundFees = async ({
  userWallet,
  mint,
}: {
  userWallet: PublicKey;
  mint: PublicKey;
}): Promise<VersionedTransaction> => {
  if (
    ![
      HNT_MINT.toBase58(),
      IOT_MINT.toBase58(),
      MOBILE_MINT.toBase58(),
    ].includes(mint.toBase58())
  ) {
    throw new Error(
      `Provided mint not supported by service: ${mint.toBase58()}`
    );
  }

  const connection = provider.connection;
  const platformWallet = provider.wallet;
  const inputAmount = await estimate({ mint });

  // Tx contains instructions to create/close WSOL token account
  // The loan below covers the rent of one account, the wrapped SOL one.
  const {
    setupInstructions,
    swapInstruction,
    cleanupInstruction,
    lookupTables,
  } = await buildFundFeesSwap({
    apiUrl: JUPITER_API_URL,
    apiKey: JUPITER_API_KEY,
    mint: mint.toBase58(),
    inputAmount,
    userWallet: userWallet.toBase58(),
    minOutLamports: MIN_FUND_FEES_OUT_LAMPORTS,
    platformWallet: platformWallet.publicKey.toBase58(),
  });

  // create rent flash loan instructions
  const ataRent =
    await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

  const borrowIx = SystemProgram.transfer({
    fromPubkey: platformWallet.publicKey,
    toPubkey: userWallet,
    lamports: ataRent,
  });

  const addressLookupTableAccounts =
    await getAdressLookupTableAccounts(lookupTables);
  const compile = (
    budgetInstructions: TransactionInstruction[],
    repayLamports: number,
    recentBlockhash: string
  ): VersionedTransaction =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: platformWallet.publicKey,
        recentBlockhash,
        instructions: [
          ...budgetInstructions,
          borrowIx,
          ...setupInstructions,
          swapInstruction,
          ...(cleanupInstruction ? [cleanupInstruction] : []),
          SystemProgram.transfer({
            fromPubkey: userWallet,
            toPubkey: platformWallet.publicKey,
            lamports: repayLamports,
          }),
        ],
      }).compileToV0Message(addressLookupTableAccounts)
    );

  // /build returns no compute unit limit, so the limit comes from a simulation of the
  // transaction at the largest limit. The repay amount does not change the units it uses.
  const simulation = await connection.simulateTransaction(
    compile(
      [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: MAX_COMPUTE_UNIT_LIMIT,
        }),
      ],
      ataRent,
      PublicKey.default.toBase58()
    ),
    { sigVerify: false, replaceRecentBlockhash: true }
  );
  const { instructions: budgetInstructions } = planComputeBudget(
    simulation.value
  );

  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  return platformWallet.signTransaction(
    compile(budgetInstructions, repayLamports(ataRent), blockhash)
  );
};
