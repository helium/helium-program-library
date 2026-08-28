---
"@helium/blockchain-api-service": patch
"@helium/blockchain-api": patch
---

Fix bugs surfaced in prod logs:

- Floor fractional proxy `expirationTime` instead of rejecting it
- Dedupe hotspots across claim-rewards pages so Jito bundles never contain duplicate transactions
- Refuse to build `closeDelegationV0` while a required epoch has no issued rewards (the program panics otherwise)
- Serve the stored batch status when the on-chain status check fails instead of returning 500
