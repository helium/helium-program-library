import { HNT_MINT, IOT_MINT, MOBILE_MINT, toBN } from "@helium/spl-utils";
import { ACCOUNT_SIZE, NATIVE_MINT, getMint } from "@solana/spl-token";
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
  MAX_COMPUTE_UNIT_LIMIT,
  buildJupiterSwap,
  computeUnitLimit,
  planComputeBudget,
} from "./build";
import { JUPITER_API_KEY, JUPITER_API_URL } from "./env";
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
    apiUrl: JUPITER_API_URL,
    apiKey: JUPITER_API_KEY,
    amount: toBN(0.020015, decimals).toString(),
    inputMint: NATIVE_MINT.toBase58(),
    outputMint: mint.toBase58(),
    taker: provider.wallet.publicKey.toBase58(),
    slippageBps: SLIPPAGE_BPS,
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
    apiUrl: JUPITER_API_URL,
    apiKey: JUPITER_API_KEY,
    amount: inputAmount,
    inputMint: mint.toBase58(),
    outputMint: NATIVE_MINT.toBase58(),
    taker: userWallet.toBase58(),
    slippageBps: SLIPPAGE_BPS,
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

  // /build returns the unit price without a limit, so the limit comes from a simulation of the
  // transaction at the largest limit. The repay amount does not change the units it uses.
  const simulation = await connection.simulateTransaction(
    compile(
      [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: MAX_COMPUTE_UNIT_LIMIT,
        }),
        ...computeBudgetInstructions,
      ],
      ataRent,
      PublicKey.default.toBase58()
    ),
    { sigVerify: false, replaceRecentBlockhash: true }
  );
  if (simulation.value.err) {
    throw new Error(
      `The fee-funding transaction fails in simulation: ${JSON.stringify(
        simulation.value.err
      )}: ${(simulation.value.logs ?? []).slice(-5).join(" | ")}`
    );
  }
  const { instructions: budgetInstructions, fee } = planComputeBudget(
    computeBudgetInstructions,
    computeUnitLimit(simulation.value.unitsConsumed ?? 0)
  );

  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  return platformWallet.signTransaction(
    compile(budgetInstructions, ataRent + fee, blockhash)
  );
};
