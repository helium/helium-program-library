import { CONFLICT, INVALID_WALLET_ADDRESS, NOT_FOUND, UNAUTHORIZED } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import {
      GetHotspotsInputSchema,
      HotspotsDataSchema,
      ClaimRewardsInputSchema,
      ClaimRewardsOutputSchema,
      GetPendingRewardsInputSchema,
      GetPendingRewardsOutputSchema,
      TransferHotspotInputSchema,
      TransferHotspotOutputSchema,
      UpdateRewardsDestinationInputSchema,
      UpdateRewardsDestinationOutputSchema,
      GetSplitInputSchema,
      SplitResponseSchema,
      CreateSplitInputSchema,
      CreateSplitOutputSchema,
      DeleteSplitInputSchema,
      DeleteSplitOutputSchema,
      CloseAutomationOutputSchema,
      CloseAutomationInputSchema,
      AutomationStatusOutputSchema,
      GetAutomationStatusInputSchema,
      FundAutomationOutputSchema,
      FundAutomationInputSchema,
      SetupAutomationOutputSchema,
      SetupAutomationInputSchema,
      FundingEstimateOutputSchema,
      GetFundingEstimateInputSchema,
      UpdateHotspotInfoInputSchema,
      UpdateHotspotInfoOutputSchema,
} from "../schemas/hotspots";
import { oc } from "@orpc/contract";

export const hotspotsContract = oc
      .tag("Hotspot")
      .prefix("/hotspots")
      .router({
            /** Public: Get hotspots for a wallet */
            getHotspots: oc
                  .route({ method: "GET", path: "/wallet/{walletAddress}", summary: "Get hotspots for a wallet" })
                  .input(GetHotspotsInputSchema)
                  .output(HotspotsDataSchema)
                  .errors({
                        INVALID_WALLET_ADDRESS
                  }),

            /** Protected: Claim rewards for hotspots */
            claimRewards: oc
                  .route({ method: "POST", path: "/claim-rewards", summary: "Claim all hotspot rewards" })
                  .input(ClaimRewardsInputSchema)
                  .output(ClaimRewardsOutputSchema)
                  .errors({
                        INSUFFICIENT_FUNDS
                  }),

            /** Public: Get pending rewards for a wallet */
            getPendingRewards: oc
                  .route({ method: "GET", path: "/pending-rewards/{walletAddress}", summary: "Get pending rewards" })
                  .input(GetPendingRewardsInputSchema)
                  .output(GetPendingRewardsOutputSchema)
                  .errors({
                        BAD_REQUEST: { message: "Invalid wallet address", status: 400 },
                        INVALID_WALLET_ADDRESS
                  }),

            /** Protected: Transfer hotspot ownership */
            transferHotspot: oc
                  .route({ method: "POST", path: "/transfer", summary: "Transfer ownership" })
                  .input(TransferHotspotInputSchema)
                  .output(TransferHotspotOutputSchema)
                  .errors({
                        UNAUTHORIZED,
                        NOT_FOUND,
                        BAD_REQUEST: { message: "Invalid transfer parameters", status: 400 },
                        INSUFFICIENT_FUNDS,
                        CONFLICT,
                  }),

            /** Protected: Update rewards destination */
            updateRewardsDestination: oc
                  .route({ method: "POST", path: "/update-rewards-destination", summary: "Update rewards destination" })
                  .input(UpdateRewardsDestinationInputSchema)
                  .output(UpdateRewardsDestinationOutputSchema)
                  .errors({
                        BAD_REQUEST: { message: "Invalid parameters", status: 400 },
                        NOT_FOUND,
                        INSUFFICIENT_FUNDS,
                  }),

            /** Public: Get split configuration for a hotspot */
            getSplit: oc
                  .route({ method: "GET", path: "/split/{walletAddress}/{hotspotPubkey}", summary: "Get reward split" })
                  .input(GetSplitInputSchema)
                  .output(SplitResponseSchema)
                  .errors({
                        NOT_FOUND: { message: "Split not found", status: 404 },
                        INVALID_WALLET_ADDRESS
                  }),

            /** Protected: Create a split configuration */
            createSplit: oc
                  .route({ method: "POST", path: "/split", summary: "Create a reward split" })
                  .input(CreateSplitInputSchema)
                  .output(CreateSplitOutputSchema)
                  .errors({
                        NOT_FOUND,
                        BAD_REQUEST: { message: "Invalid split configuration", status: 400 },
                        INSUFFICIENT_FUNDS
                  }),

            /** Protected: Delete a split configuration */
            deleteSplit: oc
                  .route({ method: "DELETE", path: "/split", summary: "Delete a reward split" })
                  .input(DeleteSplitInputSchema)
                  .output(DeleteSplitOutputSchema)
                  .errors({
                        NOT_FOUND,
                        INSUFFICIENT_FUNDS,
                  }),
            /** Protected: Close automation */
            closeAutomation: oc
                  .route({ method: "POST", path: "/wallet/{walletAddress}/automation/close", summary: "Close automation" })
                  .input(CloseAutomationInputSchema)
                  .output(CloseAutomationOutputSchema)
                  .errors({
                        NOT_FOUND,
                        INSUFFICIENT_FUNDS,
                  }),
            /** Protected: Get automation status */
            getAutomationStatus: oc
                  .route({ method: "GET", path: "/wallet/{walletAddress}/automation/status", summary: "Get automation status" })
                  .input(GetAutomationStatusInputSchema)
                  .output(AutomationStatusOutputSchema)
                  .errors({
                        NOT_FOUND,
                  }),
            /** Protected: Create automation */
            createAutomation: oc
                  .route({
                        method: "POST",
                        path: "/wallet/{walletAddress}/automation",
                        summary: "Setup automation"
                  })
                  .input(SetupAutomationInputSchema)
                  .output(SetupAutomationOutputSchema)
                  .errors({
                        NOT_FOUND,
                        INSUFFICIENT_FUNDS,
                  }),
            /** Protected: Fund automation */
            fundAutomation: oc
                  .route({ method: "POST", path: "/wallet/{walletAddress}/automation/fund", summary: "Fund automation" })
                  .input(FundAutomationInputSchema)
                  .output(FundAutomationOutputSchema)
                  .errors({
                        NOT_FOUND,
                        INSUFFICIENT_FUNDS,
                  }),

            /** Protected: Get funding estimate */
            getFundingEstimate: oc
                  .route({ method: "GET", path: "/wallet/{walletAddress}/automation/funding-estimate", summary: "Get funding estimate" })
                  .input(GetFundingEstimateInputSchema)
                  .output(FundingEstimateOutputSchema)
                  .errors({}),
updateHotspotInfo: oc
                  .route({ method: "POST", path: "/update-info", summary: "Update hotspot info", description: "Creates an unsigned transaction to update hotspot configuration. Requires deviceType discriminant (iot or mobile) to select the correct update path and validate against on-chain network." })
                  .input(UpdateHotspotInfoInputSchema)
                  .output(UpdateHotspotInfoOutputSchema)
                  .errors({
                        NOT_FOUND,
                        UNAUTHORIZED,
                        BAD_REQUEST: { message: "Device type mismatch", status: 400 },
                        INSUFFICIENT_FUNDS,
                  }),
      });
