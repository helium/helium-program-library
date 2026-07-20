import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    if (process.env.NO_PG !== "true") {
      try {
        const { transactionResubmissionService } = await import(
          "./lib/background-jobs/transaction-resubmission"
        );
        transactionResubmissionService.start();
        console.log(
          "[instrumentation] Transaction resubmission service started"
        );
      } catch (e) {
        console.error("Failed to start transaction resubmission service:", e);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
