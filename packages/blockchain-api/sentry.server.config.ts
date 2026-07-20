// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
if (process.env.NODE_ENV === "production") {
  console.log("[Sentry] Initializing server Sentry...");
  Sentry.init({
    dsn: "https://69b3ef358a6ccf304db72be11405c66d@o240702.ingest.us.sentry.io/4510783797067776",
    enabled: !!process.env.SENTRY_DSN,
    // Tag events with the package version for filtering in Sentry dashboard
    // SENTRY_RELEASE is set during Docker build from the git tag
    release: process.env.SENTRY_RELEASE,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Default is 3; our extras (e.g. bundle simulation transaction_results with
    // nested err/logs) need more depth or Sentry shows [Object]/[Array]
    normalizeDepth: 10,
    normalizeMaxBreadth: 2000,

    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
  });
}
