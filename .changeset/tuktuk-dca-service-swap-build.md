---
"@helium/tuktuk-dca-service": minor
---

The DCA service builds each order's swap through Jupiter's Swap V2 `GET /swap/v2/build` instead of `/swap/v1/quote` and `POST /swap/v1/swap-instructions`. The swap payer PDA is the taker, and `maxBytes` of 520 replaces `onlyDirectRoutes`, which `/build` does not take: it keeps the bare swap small enough that the crank turner's task transaction, which carries the swap again inside the signed remote task, stays under 1232 bytes. A `/build` answer that fails validation, swaps other mints or another amount than the order, or carries `otherInstructions` is refused. Jupiter's compute budget instructions are left out of the task, and the lookup tables are returned by key. The package gains a `test` script for its unit tests.
