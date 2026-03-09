import { webhooksContract } from "@helium/blockchain-api/contracts";
import { publicProcedure } from "../../procedures";
import { BridgeUser } from "@/lib/models/bridge-user";
import { implement } from "@orpc/server";

// ============================================================================
// Procedures
// ============================================================================

/**
 * Bridge webhook handler for KYC/ToS status updates.
 */
const bridge = publicProcedure.webhooks.bridge.handler(
  async ({ input, errors }) => {
    const data = input;

    // Handle KYC link status updates
    if (data.type === "kyc_link.status_updated") {
      const bridgeUser = await BridgeUser.findOne({
        where: { kycLinkId: data.kyc_link_id },
      });

      if (!bridgeUser) {
        console.error(
          "Bridge user not found for KYC link ID:",
          data.kyc_link_id,
        );
        throw errors.NOT_FOUND({ message: "Bridge user not found" });
      }

      // Update statuses
      await bridgeUser.update({
        kycStatus: data.kyc_status,
        tosStatus: data.tos_status,
        bridgeCustomerId: data.customer_id,
      });

      return { success: true };
    }

    // Handle other webhook types here
    return { success: true };
  },
);

// ============================================================================
// Router Export
// ============================================================================

export const webhooksRouter = implement(webhooksContract).router({
  bridge,
});
