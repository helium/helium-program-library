---
"@helium/spl-utils": patch
---

`bulkSendTransactions` and `bulkSendRawTransactions` now throw a `BulkSendError` for an on-chain failure, a missing signer, or any error after a transaction landed. Its `landedSignatures` field lists the signatures of the transactions that landed before the throw, ordered by confirmation, so a caller can skip them on a resend. Read the field instead of using `instanceof`, because the CJS and ESM builds each define the class. The message keeps its old text. When an on-chain failure or blockhash expiry ends the call and a required signer is missing, the message names the failure, then the missing signers found so far. The original error is on `cause`. An error thrown before anything landed and with no missing signer is rethrown unchanged. `sendInstructions` throws it, with no landed signatures, for a missing signer. `onProgress` in `bulkSendTransactions` now counts only the transactions it sends in `totalTxs`, like `bulkSendRawTransactions`.
