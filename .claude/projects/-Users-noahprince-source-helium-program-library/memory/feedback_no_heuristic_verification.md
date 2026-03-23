---
name: No heuristic verification
description: Never use data-shape heuristics (like field length checks) to verify account relationships — always do authoritative lookups
type: feedback
---

Never use heuristic checks like field lengths or data shapes to verify on-chain relationships. Always do proper authoritative lookups. For example, to verify a mini fanout is attached to a hotspot, look up the RecipientV0 account whose destination field matches - don't check if the seed happens to be 32 bytes.

**Why:** Heuristics can be spoofed (anyone can put a 32-byte seed). The source of truth is the on-chain account relationship.

**How to apply:** When verifying cross-program account relationships, derive the expected PDA and fetch the actual account to confirm the link.
