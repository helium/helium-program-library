---
"@helium/idls": patch
---

`mini-fanout` queues a pre task only when it is one of two shapes: a remote transaction the
Helium oracle signs, or a compiled transaction carrying no signer seeds. Anything else fails
with a new `InvalidPreTask` error.

`mini-fanout` also reserves a new fanout the space its contents need. The arithmetic covered
seven of the account's eight pubkeys and undercounted a compiled pre task, so a new fanout is
32 bytes larger than before plus what its pre task takes. Existing accounts are unaffected.

`welcome-pack` holds a claim approval to a maximum window of 30 days, with a new
`ClaimApprovalTooLong` error. An approval expiring further out than that is refused at claim
time; the owner signs a fresh one.

`hpl-crons` derives a cron job's transaction records under the cron program, which is where
they live, so `requeue_entity_claim_cron_v0` names the accounts that exist.
