import OnboardingClient from "@helium/onboarding";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { latLngToH3 } from "@/lib/location/h3";
import {
  getTransactionFee,
  calculateRequiredBalance,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Onboard a previously-issued data-only hotspot into a sub-DAO, asserting its
 * location (and, for IoT, gain/elevation). The onboarding server builds the
 * onboard transaction; we relay it for local signing.
 */
export const onboardDataOnlyHotspot =
  publicProcedure.hotspots.onboardDataOnlyHotspot.handler(
    async ({ input, errors }) => {
      const {
        walletAddress,
        network,
        hotspotAddress,
        lat,
        lng,
        elevation,
        gain,
      } = input;

      const { connection } = createSolanaConnection(walletAddress);
      const onboardingClient = new OnboardingClient(env.ONBOARDING_ENDPOINT);

      const h3 =
        lat !== undefined && lng !== undefined
          ? latLngToH3({ lat, lng })
          : null;

      const response =
        network === "iot"
          ? await onboardingClient.onboardIot({
              hotspotAddress,
              payer: walletAddress,
              format: "v0",
              location: h3?.iot,
              elevation,
              gain,
            })
          : await onboardingClient.onboardMobile({
              hotspotAddress,
              payer: walletAddress,
              format: "v0",
              location: h3?.mobile,
            });

      const rawTxs = response.data?.solanaTransactions ?? [];
      if (rawTxs.length === 0) {
        throw errors.NOT_FOUND({
          message:
            "Onboarding server returned no transactions to onboard this hotspot",
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
              type: "onboard_data_only_hotspot",
              description: "Onboard a data-only hotspot",
              network,
            },
          })),
          parallel: false,
          tag: `onboard_data_only_hotspot:${walletAddress}:${hotspotAddress}`,
          actionMetadata: { type: "onboard_data_only_hotspot", network },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58()
        ),
      };
    }
  );
