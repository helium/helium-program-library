---
"@helium/blockchain-api-service": patch
---

Make `delegatePositions` correct and fast for many positions. Ownership, claim
bots, registrars and proxy configs are read in batches instead of once per
position, the claim-bot instructions carry every account explicitly so Anchor
fetches no IDL or related account per position, and each position reserves its
own tuktuk task id so a bundle no longer collides with itself. Lockups,
expirations and seasons are judged on the registrar clock, constant lockups are
recognized by the program's `i64::MAX` sentinel, and a season is current only
while `start <= now < end`, so a request past the last season is refused instead
of signing a bundle that panics in `delegate_v0`. The funds preflight prices
delegation rent from program-declared account sizes and the per-bot prepay, and
`createPosition` quotes every lamport the bundle charges the wallet.
