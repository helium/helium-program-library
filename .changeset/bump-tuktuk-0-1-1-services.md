---
"@helium/blockchain-api-service": patch
"@helium/helium-vote-service": patch
"@helium/tuktuk-dca-service": patch
"@helium/tuktuk-pyth-service": patch
---

Bump @helium/tuktuk-sdk, @helium/tuktuk-idls and @helium/cron-sdk to ^0.1.1. The delegate
endpoint keeps returning BAD_REQUEST when the automation task queue has fewer free slots
than positions, now that `nextAvailableTaskIds` throws instead of returning a short list.
