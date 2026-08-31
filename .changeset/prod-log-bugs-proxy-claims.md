---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Fix bugs surfaced in prod logs:

- Floor fractional proxy `expirationTime` instead of rejecting it
- Dedupe hotspots across claim-rewards pages so Jito bundles never contain duplicate transactions
- Refuse to build `closeDelegationV0` while a required epoch has no issued rewards (the program panics otherwise)
- Serve the stored batch status when the on-chain status check fails instead of returning 500
- Order the paginated hotspot query by asset so pages are stable, and dedupe within a page as well as across pages
- Keep the safe-integer bound on proxy `expirationTime` after flooring
- Rethrow database errors from the batch status check and build the fallback from a pre-check snapshot
