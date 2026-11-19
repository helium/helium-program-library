---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": patch
---

Mark the ignored getInstructions inputs (dynamicComputeUnitLimit, useSharedAccounts, prioritizationFeeLamports) as deprecated in the schema and the OpenAPI spec, and log the user agent of callers that still send them. dynamicComputeUnitLimit no longer defaults to true, so in the parsed `GetInstructionsInput` type it is now `boolean | undefined`; nothing reads it.
