import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { DataCredits } from "@helium/idls/lib/types/data_credits";
import { DC_MINT } from "@helium/spl-utils";
import { InstructionWithEphemeralSigners, PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { PublicKey } from "@solana/web3.js";
import { HermesClient } from "@pythnetwork/hermes-client";

const HNT_PRICE_FEED_ID = "0x649fdd7ec08e8e2a20f425729854e90293dcbe2376abc47197a14da6ff339756"

export const PYTH_HERMES_URL = "https://hermes.pyth.network/"

export async function mintDataCredits({
  dcMint = DC_MINT,
  dcAmount,
  hntAmount,
  program
}: {
  dcMint?: PublicKey,
  dcAmount?: BN,
  hntAmount?: BN,
  program: Program<DataCredits>,
}) {

  if (!hntAmount && !dcAmount) {
    throw new Error("Either hntAmount or dcAmount must be provided");
  }

  // The URL below is a public Hermes instance operated by the Pyth Data Association.
  // Hermes is also available from several third-party providers listed here:
  // https://docs.pyth.network/price-feeds/api-instances-and-providers/hermes
  const priceServiceConnection = new HermesClient(
    PYTH_HERMES_URL,
    {}
  );

  // Hermes provides other methods for retrieving price updates. See
  // https://hermes.pyth.network/docs for more information.
  const priceUpdates = (
    await priceServiceConnection.getLatestPriceUpdates(
      [HNT_PRICE_FEED_ID],
      { encoding: "base64" }
    )
  );
  const priceUpdateData = priceUpdates.binary.data

  const wallet = program.provider.wallet
  const connection = program.provider.connection

  // @ts-ignore
  const pythSolanaReceiver = new PythSolanaReceiver({ connection, wallet: wallet! });

  const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
    closeUpdateAccounts: true,
  });
  await transactionBuilder.addPostPriceUpdates(priceUpdateData);

  await transactionBuilder.addPriceConsumerInstructions(
    async (
      getPriceUpdateAccount: (priceFeedId: string) => PublicKey
    ): Promise<InstructionWithEphemeralSigners[]> => {
      // Generate instructions here that use the price updates posted above.
      // getPriceUpdateAccount(<price feed id>) will give you the account for each price update.
      return [{
        instruction: await program.methods
          .mintDataCreditsV0({
            hntAmount: hntAmount ? hntAmount : null,
            dcAmount: dcAmount ? dcAmount : null,
          })
          .accountsPartial({ dcMint, hntPriceOracle: getPriceUpdateAccount(HNT_PRICE_FEED_ID) })
          .instruction(),
        signers: [],
      }];
    }
  );

  return {
    txs: await transactionBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 10000,
    }),
    priceUpdates,
  }
}