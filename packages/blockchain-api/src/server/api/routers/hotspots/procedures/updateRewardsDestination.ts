import { publicProcedure } from "../../../procedures";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { proofArgsAndAccounts } from "@helium/spl-utils";
import {
  init as initLazy,
  initializeCompressionRecipient,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import { createSolanaConnection } from "@/lib/solana";
import { env } from "@/lib/env";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

async function exists(
  connection: { getAccountInfo: (account: PublicKey) => Promise<unknown> },
  account: PublicKey,
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}

/**
 * Update the rewards destination for a hotspot across one or more lazy distributors.
 */
export const updateRewardsDestination =
  publicProcedure.hotspots.updateRewardsDestination.handler(
    async ({ input, errors }) => {
      const { walletAddress, hotspotPubkey, lazyDistributors, destination } =
        input;

      // Resolve hotspot pubkey to asset ID
      const assetId = await getAssetIdFromPubkey(hotspotPubkey);
      if (!assetId) {
        throw errors.NOT_FOUND({ message: "Hotspot not found" });
      }

      // Validate public keys
      let assetPubkey: PublicKey;
      let destinationPubkey: PublicKey;
      const lazyDistributorPubkeys: PublicKey[] = [];

      try {
        assetPubkey = new PublicKey(assetId);
        destinationPubkey = new PublicKey(destination);

        for (const ld of lazyDistributors) {
          lazyDistributorPubkeys.push(new PublicKey(ld));
        }
      } catch {
        throw errors.BAD_REQUEST({ message: "Invalid public key format" });
      }

      // Create connection and provider
      const { connection, provider, wallet } =
        createSolanaConnection(walletAddress);

      // Check if destination exists
      const destinationExists = await exists(connection, destinationPubkey);

      const program = await initLazy(provider);

      // Count recipients that need to be created and check balance
      let recipientsNeeded = 0;
      for (const lazy of lazyDistributorPubkeys) {
        const [recipientPk] = recipientKey(lazy, assetPubkey);
        const recipientExists = await exists(connection, recipientPk);
        if (!recipientExists) {
          recipientsNeeded++;
        }
      }

      if (recipientsNeeded > 0) {
        const walletBalance = await connection.getBalance(wallet.publicKey);
        const rentCost = RENT_COSTS.RECIPIENT * recipientsNeeded;
        const required = calculateRequiredBalance(
          BASE_TX_FEE_LAMPORTS,
          rentCost,
        );
        if (walletBalance < required) {
          throw errors.INSUFFICIENT_FUNDS({
            message: "Insufficient SOL balance to update rewards destination",
            data: { required, available: walletBalance },
          });
        }
      }

      // Get proof args and accounts for the asset
      const assetEndpoint =
        env.ASSET_ENDPOINT || program.provider.connection.rpcEndpoint;

      const {
        asset: {
          ownership: { owner },
        },
        args,
        accounts,
        remainingAccounts,
      } = await proofArgsAndAccounts({
        connection: program.provider.connection,
        assetId: assetPubkey,
        assetEndpoint,
      });

      // Build instructions for each lazy distributor
      const instructions: TransactionInstruction[] = (
        await Promise.all(
          lazyDistributorPubkeys.map(async (lazy) => {
            const [recipientPk] = recipientKey(lazy, assetPubkey);
            const recipientExists = await exists(connection, recipientPk);

            const ixs: TransactionInstruction[] = [];

            // Initialize recipient if it doesn't exist
            if (!recipientExists) {
              ixs.push(
                await (
                  await initializeCompressionRecipient({
                    program,
                    assetId: assetPubkey,
                    lazyDistributor: lazy,
                    payer: wallet.publicKey,
                  })
                ).instruction(),
              );
            }

            // Create update compression destination instruction
            ixs.push(
              await program.methods
                .updateCompressionDestinationV0({
                  ...args,
                })
                .accountsPartial({
                  ...accounts,
                  owner,
                  recipient: recipientKey(lazy, assetPubkey)[0],
                  destination:
                    destination === PublicKey.default.toBase58()
                      ? PublicKey.default
                      : destinationPubkey,
                })
                .remainingAccounts(remainingAccounts)
                .instruction(),
            );

            return ixs;
          }),
        )
      ).flat();

      const tx = await buildVersionedTransaction({
        connection,
        draft: {
          instructions,
          feePayer: wallet.publicKey,
        },
      });
      const serializedTransaction = serializeTransaction(tx);

      // Generate transaction tag for deduplication
      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.UPDATE_REWARDS_DESTINATION,
        walletAddress,
        assetId,
        destination,
        lazyDistributors: lazyDistributors.join(","),
        timestamp: Date.now(),
      });

      const rentCost = RENT_COSTS.RECIPIENT * recipientsNeeded;
      const txFee = getTransactionFee(tx);
      const estimatedSolFeeLamports = txFee + rentCost;

      return {
        transactionData: {
          transactions: [
            {
              serializedTransaction,
              metadata: {
                type: TRANSACTION_TYPES.UPDATE_REWARDS_DESTINATION,
                description: destinationExists
                  ? `Update rewards destination to ${destination.slice(
                      0,
                      4,
                    )}...${destination.slice(-4)}`
                  : `Update rewards destination to ${destination.slice(
                      0,
                      4,
                    )}...${destination.slice(
                      -4,
                    )} (Warning: destination account does not exist)`,
                hotspotKey: assetId,
                destination,
              },
            },
          ],
          parallel: false,
          tag,
          actionMetadata: { type: TRANSACTION_TYPES.UPDATE_REWARDS_DESTINATION, hotspotKey: assetId, destination },
        },
        estimatedSolFee: toTokenAmountOutput(
          new BN(estimatedSolFeeLamports),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
