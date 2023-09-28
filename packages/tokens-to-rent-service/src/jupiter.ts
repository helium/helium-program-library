import { HNT_MINT, IOT_MINT, MOBILE_MINT, toBN } from '@helium/spl-utils';
import {
  Configuration,
  DefaultApi,
  Instruction,
  AccountMeta,
} from '@jup-ag/api';
import { ACCOUNT_SIZE, NATIVE_MINT, getMint } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { JUPITER_FEE_ACCOUNT, JUPITER_FEE_BPS, JUPITER_URL } from './env';
import { provider } from './solana';

export const instructionDataToTransactionInstruction = (
  instruction: Instruction | undefined
) => {
  if (instruction === null || instruction === undefined) return null;
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key: AccountMeta) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, 'base64'),
  });
};

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

const buildJupiterApi = (() => {
  let api: DefaultApi | undefined;

  return () => {
    if (api) return api;
    const config = new Configuration({ basePath: JUPITER_URL });
    api = new DefaultApi(config);
    return api;
  };
})();

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
  const client = buildJupiterApi();
  const quote = await client.quoteGet({
    amount: toBN(0.020015, decimals).toNumber(),
    inputMint: NATIVE_MINT.toBase58(),
    outputMint: mint.toBase58(),
    slippageBps: 100, // 1%
    platformFeeBps: Number(JUPITER_FEE_BPS) || 0,
  });

  if (!quote) throw new Error('Unable to quote');
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
  const client = buildJupiterApi();
  const inputAmount = await estimate({ mint });
  const quote = await client.quoteGet({
    amount: Number(inputAmount),
    inputMint: mint.toBase58(),
    outputMint: NATIVE_MINT.toBase58(),
    slippageBps: 100, // 1%
    platformFeeBps: Number(JUPITER_FEE_BPS) || 0,
  });

  // Tx contains instructions to create/close WSOL token account
  const {
    computeBudgetInstructions,
    setupInstructions,
    swapInstruction,
    cleanupInstruction,
    addressLookupTableAddresses,
  } = await client.swapInstructionsPost({
    swapRequest: {
      quoteResponse: quote,
      userPublicKey: userWallet.toBase58(),
      feeAccount: JUPITER_FEE_ACCOUNT || undefined,
    },
  });

  // create rent flash loan instructions
  const ataRent = await connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE
  );

  const borrowIx = SystemProgram.transfer({
    fromPubkey: platformWallet.publicKey,
    toPubkey: userWallet,
    lamports: ataRent,
  });

  const repayIx = SystemProgram.transfer({
    fromPubkey: userWallet,
    toPubkey: platformWallet.publicKey,
    lamports: ataRent + 10000,
  });

  const instructions: TransactionInstruction[] = [
    ...computeBudgetInstructions.map(instructionDataToTransactionInstruction),
    borrowIx,
    ...setupInstructions.map(instructionDataToTransactionInstruction),
    instructionDataToTransactionInstruction(swapInstruction),
    instructionDataToTransactionInstruction(cleanupInstruction),
    repayIx,
  ].filter((ix) => ix !== null) as TransactionInstruction[];

  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const addressLookupTableAccounts = await getAdressLookupTableAccounts(
    addressLookupTableAddresses
  );

  const messageV0 = new TransactionMessage({
    payerKey: platformWallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(addressLookupTableAccounts);

  const transaction = new VersionedTransaction(messageV0);
  return platformWallet.signTransaction(transaction);
};
