import { transactionResubmissionService } from "../background-jobs/transaction-resubmission";

/**
 * Initialize all background services
 */
export function initializeBackgroundServices(): void {
  console.log("Initializing background services...");

  // Start transaction resubmission service
  transactionResubmissionService.start();

  console.log("Background services initialized");
}

/**
 * Shutdown all background services gracefully
 */
export function shutdownBackgroundServices(): void {
  console.log("Shutting down background services...");

  // Stop transaction resubmission service
  transactionResubmissionService.stop();

  console.log("Background services shut down");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  shutdownBackgroundServices();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  shutdownBackgroundServices();
  process.exit(0);
});
