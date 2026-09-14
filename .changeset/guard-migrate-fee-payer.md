---
"@helium/blockchain-api-service": patch
"@helium/migration-service": patch
---

Reject migrate requests whose source or destination wallet is the service fee payer. A request with `from` set to the service's own key made the service sign away its own balance. migration-service also gains the `from != to` and on-curve destination checks blockchain-api already had.
