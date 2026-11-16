---
"@helium/blockchain-api": patch
"@helium/blockchain-api-service": patch
---

`closePosition` returns BAD_REQUEST for a Constant lockup position. The position must flip to Cliff and decay before it can close.
