import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import {
  buildFundFeesTransaction,
  estimateSwapInput,
  FundFeesConnection,
  FundFeesSigner,
} from "./build";
import { Clock, estimateCache, fundFeesStore } from "./reuse";

/**
 * The service's estimate and fee-funding transaction. Each mint's estimate is kept for 15 seconds,
 * and a wallet's signed transaction is held for 60 seconds, see `./reuse`.
 */
export const createService = (deps: {
  estimateSwapInput: typeof estimateSwapInput;
  buildFundFeesTransaction: typeof buildFundFeesTransaction;
  connection: FundFeesConnection;
  /** The platform wallet: it prices the estimate and signs the transaction. */
  signer: FundFeesSigner;
  lookupTableAccounts: (keys: string[]) => Promise<AddressLookupTableAccount[]>;
  now: Clock;
  apiUrl: string;
  apiKey?: string;
}) => {
  const cachedEstimate = estimateCache(deps.now);
  const signOnce = fundFeesStore(deps.now);

  const estimate = ({ mint }: { mint: PublicKey }): Promise<string> =>
    cachedEstimate(mint.toBase58(), () =>
      deps.estimateSwapInput({
        apiUrl: deps.apiUrl,
        apiKey: deps.apiKey,
        mint: mint.toBase58(),
        platformWallet: deps.signer.publicKey.toBase58(),
      })
    );

  /** The serialized, signed fee-funding transaction. */
  const fundFees = ({
    userWallet,
    mint,
  }: {
    userWallet: PublicKey;
    mint: PublicKey;
  }): Promise<Uint8Array> =>
    signOnce(
      { wallet: userWallet.toBase58(), mint: mint.toBase58() },
      async () =>
        (
          await deps.buildFundFeesTransaction(
            {
              apiUrl: deps.apiUrl,
              apiKey: deps.apiKey,
              mint: mint.toBase58(),
              inputAmount: await estimate({ mint }),
              userWallet: userWallet.toBase58(),
            },
            {
              connection: deps.connection,
              signer: deps.signer,
              lookupTableAccounts: deps.lookupTableAccounts,
            }
          )
        ).serialize()
    );

  return { estimate, fundFees };
};
