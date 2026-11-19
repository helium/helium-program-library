---
"@helium/blockchain-api": minor
"@helium/blockchain-api-service": patch
---

`swap.getInstructions` measures the serialized swap transaction, signature slots included, against Solana's 1232-byte packet limit. A Jupiter route can serialize over it once the compute budget instructions are added; such a transaction was returned unsendable or failed as an internal error. A transaction over the limit is now built again through Jupiter's `/swap/v2/build` with `maxBytes` lowered by the overshoot (starting from 1232, each requote from the previous budget), up to 3 times, and each requote still has to clear the quote's minimum output. A route that stays over the limit, or a requote Jupiter finds no route for within its `maxBytes`, is refused with the new `TRANSACTION_TOO_LARGE` error (HTTP 422). The first build sends no `maxBytes`, so a route that fits is unchanged. `/build` is requested at most 8 times per call: 4 builds, each with the existing one-retry minimum-output check.
