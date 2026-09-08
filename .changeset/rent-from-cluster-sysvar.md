---
"@helium/hpl-crons-sdk": minor
"@helium/helium-sub-daos-sdk": minor
"@helium/lazy-distributor-sdk": minor
"@helium/automation-hooks": minor
"@helium/voter-stake-registry-hooks": minor
"@helium/distributor-oracle": minor
---

Price account rent from the cluster's Rent sysvar instead of hardcoded lamports.
The SDKs export the byte sizes of the accounts they own (`entityClaimCronSpaces`,
`cronJobSpace`, `DELEGATED_POSITION_SPACE`, `DELEGATION_CLAIM_BOT_SPACE`,
`recipientSpace`, ...). `AUTOMATION_BOT_FEE` and `DELEGATION_FEE` are removed from
voter-stake-registry-hooks and `RECIPIENT_RENT` / `ATA_RENT` from distributor-oracle;
`usePositionsFees` and `useAutomateHotspotClaims` now report `loading` while rent is
being fetched.
