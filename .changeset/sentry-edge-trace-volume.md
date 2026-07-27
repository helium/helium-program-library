---
"@helium/blockchain-api": patch
---

Stop tracing middleware in Sentry. The edge runtime's `tracesSampleRate: 1` emitted 155,763 bare `middleware GET` / `middleware POST` transactions in the 2026-07-12 billing period, duplicating timing the route transaction already records. That was 40% of this service's transaction volume and the largest single contributor to exhausting the org's shared 500k quota nine days into a thirty-day period, which rate-limits performance data for every other project in the org. Error reporting from middleware is unaffected.
