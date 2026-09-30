---
"@helium/blockchain-api-service": patch
---

Charge the recipient rent once in `getFundingEstimate` and `getAutomationStatus`. When the PDA wallet balance covered its own rent and the HNT ATA rent but only part of the recipient rent, `recipientFee` added the covered part (balance minus PDA and ATA rent) on top of the PDA wallet funding, which already carries every recipient's rent. `recipientFee` is now always 0, and `totalSolNeeded` drops by that amount for wallets in that range; other estimates are unchanged.
