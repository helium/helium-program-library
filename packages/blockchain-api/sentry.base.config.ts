// Base Sentry configuration shared between server and edge configs
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * Common beforeSend handler that filters out sensitive data.
 * Used by both server and edge Sentry configurations.
 */
export function filterSensitiveData<T extends Sentry.Event>(
  event: T,
  hint: Sentry.EventHint,
): T | null {
  // Filter out sensitive data from request body
  if (event.request) {
    if (event.request.data) {
      const data = event.request.data as Record<string, unknown>
      if (typeof data === "object" && data !== null) {
        if (Array.isArray(data.transactions)) {
          data.transactions = data.transactions.map((tx: unknown) => {
            if (typeof tx === "object" && tx !== null) {
              const txObj = tx as Record<string, unknown>
              if ("serializedTransaction" in txObj) {
                return { ...txObj, serializedTransaction: "[FILTERED]" }
              }
            }
            return tx
          })
        }
        if ("serializedTransaction" in data) {
          data.serializedTransaction = "[FILTERED]"
        }
      }
    }
  }

  // Filter out sensitive data from extra context
  if (event.extra) {
    Object.keys(event.extra).forEach((key) => {
      if (
        key.toLowerCase().includes("transaction") ||
        key.toLowerCase().includes("signature") ||
        key.toLowerCase().includes("private") ||
        key.toLowerCase().includes("key") ||
        key.toLowerCase().includes("serialized")
      ) {
        event.extra![key] = "[FILTERED]"
      }
    })
  }

  // Filter out sensitive data from contexts (server only)
  if (event.contexts) {
    Object.keys(event.contexts).forEach((key) => {
      const context = event.contexts?.[key]
      if (typeof context === "object" && context !== null) {
        Object.keys(context).forEach((contextKey) => {
          if (
            contextKey.toLowerCase().includes("transaction") ||
            contextKey.toLowerCase().includes("signature") ||
            contextKey.toLowerCase().includes("private") ||
            contextKey.toLowerCase().includes("key") ||
            contextKey.toLowerCase().includes("serialized")
          ) {
            context[contextKey] = "[FILTERED]"
          }
        })
      }
    })
  }

  return event
}

/**
 * Common Sentry initialization options shared between server and edge.
 */
export const commonSentryOptions = {
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  beforeSend: filterSensitiveData,
}

