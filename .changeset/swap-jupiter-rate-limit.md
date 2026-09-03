---
"@helium/blockchain-api-service": patch
---

Surface Jupiter rate limiting from `swap.getQuote` and `swap.getInstructions`
as `RATE_LIMITED` (429) so clients back off, classified before Jupiter's error
codes so a 429 body is never mistaken for a bad request.
