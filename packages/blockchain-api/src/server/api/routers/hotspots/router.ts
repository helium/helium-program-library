import { getHotspots } from "./procedures/getHotspots";
import { claimRewards } from "./procedures/claimRewards";
import { claimHotspotRewards } from "./procedures/claimHotspotRewards";
import { burnHotspot } from "./procedures/burnHotspot";
import { getPendingRewards } from "./procedures/getPendingRewards";
import { transferHotspot } from "./procedures/transferHotspot";
import { updateRewardsDestination } from "./procedures/updateRewardsDestination";
import { getSplit } from "./procedures/getSplit";
import { createSplit } from "./procedures/createSplit";
import { deleteSplit } from "./procedures/deleteSplit";
import { getAutomationStatus } from "./procedures/getAutomationStatus";
import { createAutomation } from "./procedures/createAutomation";
import { fundAutomation } from "./procedures/fundAutomation";
import { closeAutomation } from "./procedures/closeAutomation";
import { getFundingEstimate } from "./procedures/getFundingEstimate";
import { requeueAutomation } from "./procedures/requeueAutomation";
import { addWalletToAutomation } from "./procedures/addWalletToAutomation";
import { addEntityToAutomation } from "./procedures/addEntityToAutomation";
import { removeEntityFromAutomation } from "./procedures/removeEntityFromAutomation";
import { topUpAutomation } from "./procedures/topUpAutomation";
import { updateHotspotInfo } from "./procedures/updateHotspotInfo";
import { hotspotsContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

/**
 * Hotspots router - handles all hotspot-related operations.
 */
export const hotspotsRouter = implement(hotspotsContract).router({
  /** Get hotspots by wallet address with filtering and pagination */
  getHotspots,
  /** Create transactions to claim rewards for hotspots */
  claimRewards,
  /** Create transactions to claim rewards for a single hotspot */
  claimHotspotRewards,
  /** Create a transaction to burn (destroy) a hotspot */
  burnHotspot,
  /** Get pending rewards for all hotspots in a wallet */
  getPendingRewards,
  /** Create a transaction to transfer a hotspot to a new owner */
  transferHotspot,
  /** Update the rewards destination for a hotspot */
  updateRewardsDestination,
  /** Get the split configuration for a hotspot */
  getSplit,
  /** Create a split configuration for a hotspot */
  createSplit,
  /** Remove the split configuration from a hotspot */
  deleteSplit,
  /** Get automation status including fees and remaining claims/time */
  getAutomationStatus,
  /** Create transactions to set up claim automation */
  createAutomation,
  /** Create transactions to fund existing automation */
  fundAutomation,
  /** Get funding estimate for automation without constructing transactions */
  getFundingEstimate,
  /** Create transactions to close and remove automation */
  closeAutomation,
  /** Requeue an automation that ran out of SOL */
  requeueAutomation,
  /** Add a whole-wallet claim to an automation */
  addWalletToAutomation,
  /** Add a single hotspot claim to an automation */
  addEntityToAutomation,
  /** Remove a claim entry from an automation */
  removeEntityFromAutomation,
  /** Operator floor top-up for a batch of automations */
  topUpAutomation,
  /** Update hotspot info (location, gain, elevation, deployment info) */
  updateHotspotInfo,
});
