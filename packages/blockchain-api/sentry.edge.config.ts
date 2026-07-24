// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  release: process.env.SENTRY_RELEASE,

  // Tracing off for the edge runtime. The only thing it traces here is
  // middleware, which emitted 155,763 transactions in the 2026-07-12 billing
  // period -- 40% of this project's total -- as bare `middleware GET` /
  // `middleware POST` entries that duplicate the timing of the route
  // transaction each request already produces. That volume is what exhausted
  // the org's 500k transaction quota nine days into a thirty-day period, which
  // in turn drops performance data for every other project in the org.
  //
  // This only affects tracing. Errors thrown in middleware still report, and
  // are unsampled.
  tracesSampleRate: 0,

  normalizeDepth: 10,
  normalizeMaxBreadth: 2000,
  sendDefaultPii: true,
});
