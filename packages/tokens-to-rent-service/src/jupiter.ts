import { HNT_MINT, IOT_MINT, MOBILE_MINT, toBN } from "@helium/spl-utils";
import { ACCOUNT_SIZE, NATIVE_MINT, getMint } from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { buildJupiterSwap, planComputeBudget } from "./build";
import { JUPITER_FEE_ACCOUNT, JUPITER_FEE_BPS, JUPITER_URL } from "./env";
import { provider } from "./solana";

const SLIPPAGE_BPS = 100; // 1%

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

  const connection = provider.connection;
  const decimals = (await getMint(connection, NATIVE_MINT)).decimals;
  // /build has no quote-only form, so the price comes from a build for the platform wallet,
  // whose instructions are discarded.
  const quote = await buildJupiterSwap({
    apiUrl: JUPITER_URL,
    amount: toBN(0.020015, decimals).toString(),
    inputMint: NATIVE_MINT.toBase58(),
    outputMint: mint.toBase58(),
    taker: provider.wallet.publicKey.toBase58(),
    slippageBps: SLIPPAGE_BPS,
    platformFeeBps: Number(JUPITER_FEE_BPS) || 0,
    feeAccount: JUPITER_FEE_ACCOUNT,
    fitFundFeesTransaction: false,
  });

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
  const {
    computeBudgetInstructions,
    setupInstructions,
    swapInstruction,
    cleanupInstruction,
    lookupTables,
  } = await buildJupiterSwap({
    apiUrl: JUPITER_URL,
    amount: inputAmount,
    inputMint: mint.toBase58(),
    outputMint: NATIVE_MINT.toBase58(),
    taker: userWallet.toBase58(),
    slippageBps: SLIPPAGE_BPS,
    platformFeeBps: Number(JUPITER_FEE_BPS) || 0,
    feeAccount: JUPITER_FEE_ACCOUNT,
    fitFundFeesTransaction: true,
  });

  // create rent flash loan instructions
  const ataRent =
    await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

  const borrowIx = SystemProgram.transfer({
    fromPubkey: platformWallet.publicKey,
    toPubkey: userWallet,
    lamports: ataRent,
  });

  const { instructions: budgetInstructions, fee } = planComputeBudget(
    computeBudgetInstructions
  );

  const repayIx = SystemProgram.transfer({
    fromPubkey: userWallet,
    toPubkey: platformWallet.publicKey,
    lamports: ataRent + fee,
  });

  const instructions: TransactionInstruction[] = [
    ...budgetInstructions,
    borrowIx,
    ...setupInstructions,
    swapInstruction,
    ...(cleanupInstruction ? [cleanupInstruction] : []),
    repayIx,
  ];

  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const addressLookupTableAccounts =
    await getAdressLookupTableAccounts(lookupTables);

  const messageV0 = new TransactionMessage({
    payerKey: platformWallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(addressLookupTableAccounts);

  const transaction = new VersionedTransaction(messageV0);
  return platformWallet.signTransaction(transaction);
};
