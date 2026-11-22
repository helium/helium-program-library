---
"@helium/blockchain-api-service": patch
---

`delegatePositions` and create position import `@helium/tuktuk-sdk` statically. The CJS build kept the dynamic `import()`, so Node loaded the SDK's broken ESM build and threw `ERR_MODULE_NOT_FOUND`. Delegation then failed for any position whose claim bot had a queued task, and auto claim could not be turned off.
