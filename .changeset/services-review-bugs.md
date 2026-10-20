---
"@helium/account-postgres-sink-service": patch
"@helium/blockchain-api-service": patch
---

account-postgres-sink-service aborts the previous stream before a reconnect, so a stalled stream that resumes no longer writes accounts or an older cursor. A cursor reset always runs its planned reconnect.

blockchain-api-service builds delegation extend accounts with the shared helper, so a position whose genesis end equals the registrar clock no longer fails `ConstraintSeeds`. Position create skips an ended season and returns `BAD_REQUEST` when no season covers now. Wallet-signed routes declare `WALLET_SIGNED` in place of a v0 pin.
