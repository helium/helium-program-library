---
"@helium/blockchain-api-service": patch
---

Fix transactions.history pinning the database CPU. Index pending_transactions on signature and batch_id, and look up already-known signatures with one query per Helius page instead of one query per transaction.
