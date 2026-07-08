import OnboardingClient from "@helium/onboarding";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import {
  getTransactionFee,
  calculateRequiredBalance,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Issue (mint) a data-only hotspot. The onboarding server verifies the
 * hotspot's key against the ECC verifier and co-signs the issue transaction; we
 * relay it for the wallet to add the owner signature and submit.
 */
export const issueDataOnlyHotspot =
  publicProcedure.hotspots.issueDataOnlyHotspot.handler(
    async ({ input, errors }) => {
      const { walletAddress, addGatewayTxn } = input;

      const { connection } = createSolanaConnection(walletAddress);
      const onboardingClient = new OnboardingClient(env.ONBOARDING_ENDPOINT);

      const response = await onboardingClient.createHotspot({
        transaction: addGatewayTxn,
        payer: walletAddress,
        format: "v0",
      });

      const rawTxs = response.data?.solanaTransactions ?? [];
      if (rawTxs.length === 0) {
        throw errors.NOT_FOUND({
          message:
            "Onboarding server returned no transactions to issue this hotspot",
        });
      }

      const rawTxBytes = rawTxs.map((t) => Buffer.from(t));
      const totalFee = rawTxBytes.reduce(
        (sum, bytes) =>
          sum + getTransactionFee(VersionedTransaction.deserialize(bytes)),
        0
      );

      const walletBalance = await connection.getBalance(
        new PublicKey(walletAddress)
      );
      const required = calculateRequiredBalance(totalFee, 0);
      if (walletBalance < required) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required, available: walletBalance },
        });
      }

      return {
        transactionData: {
          transactions: rawTxBytes.map((bytes) => ({
            serializedTransaction: bytes.toString("base64"),
            metadata: {
              type: "issue_data_only_hotspot",
              description: "Issue a data-only hotspot",
            },
          })),
          parallel: false,
          tag: `issue_data_only_hotspot:${walletAddress}`,
          actionMetadata: { type: "issue_data_only_hotspot" },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58()
        ),
      };
    }
  );
