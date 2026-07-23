---
"@helium/voter-stake-registry-sdk": minor
---

Add `castingProxies` to the `Vote` type returned by `getVotesForProposal`, matching the helium-vote-service proposal-votes endpoint's owner-attribution response (each entry lists a casting proxy's wallet and registered name).
