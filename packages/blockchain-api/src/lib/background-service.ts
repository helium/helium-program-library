import { transactionResubmissionService } from "./background-jobs/transaction-resubmission";
import { defineAssociations } from "./models/associations"; // Load model associations

// Define associations before starting the service
defineAssociations();

/**
 * Start the background service
 * This should be called from server-side code only
 */
export function startBackgroundService(): void {
  if (typeof window !== "undefined") {
    console.warn("Background service should not be started on client side");
    return;
  }

  console.log("Starting background service...");
  transactionResubmissionService.start();
}
