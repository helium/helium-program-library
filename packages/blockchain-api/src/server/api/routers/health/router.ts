import { healthContract } from "@helium/blockchain-api/contracts";
import { publicProcedure } from "../../procedures";
import { connectToDb } from "@/lib/utils/db";
import { implement } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";

// ============================================================================
// Procedures
// ============================================================================

/**
 * Health check procedure.
 * Verifies API and database connectivity.
 */
const check = publicProcedure.health.check.handler(async () => {
  try {
    await connectToDb();
    return { ok: true };
  } catch (error) {
    console.error("Health check failed:", error);
    return { ok: false, error: "Database connection failed" };
  }
});

/**
 * Test Sentry error reporting.
 * This endpoint intentionally throws an error to test Sentry integration.
 * Only available in development/test environments.
 */
const testSentry = publicProcedure.health.testSentry.handler(async () => {
  // Only allow in development/test environments
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.NODE_ENV !== "test"
  ) {
    return {
      ok: false,
      error: "Sentry test endpoint is only available in development/test",
    };
  }

  // Capture a test error with context
  const testError = new Error("Sentry test error - this is intentional");
  Sentry.captureException(testError, {
    level: "info",
    tags: {
      test: true,
      error_type: "sentry_test",
    },
    extra: {
      message: "This is a test error to verify Sentry is working",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    },
    contexts: {
      test: {
        purpose: "Verify Sentry integration is working correctly",
        endpoint: "/api/v1/health/test-sentry",
      },
    },
  });

  // Also throw the error to test error handling
  throw testError;
});

// ============================================================================
// Router Export
// ============================================================================

export const healthRouter = implement(healthContract).router({
  check,
  testSentry,
});
