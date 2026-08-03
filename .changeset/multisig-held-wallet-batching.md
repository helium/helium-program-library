---
"@helium/blockchain-api": patch
---

Let a multisig-held wallet use the governance endpoints. A Squads vault owns its assets through a program address, and eleven call sites derived associated token addresses without `allowOwnerOffCurve`, so `getAssociatedTokenAddressSync` threw `TokenOwnerOffCurveError` and failed the whole request rather than one derivation.

`buildClaimInstructions` is one of them, and the claim, undelegate and delegate procedures all call it first, so claiming delegation rewards, undelegating, and re-delegating an expired position were unavailable to every vault-held veHNT position that had an unclaimed epoch. `delegate.ts` also derived the reward account this way when enabling autoclaim, so a vault could not turn automation back on.

The derived address is identical either way and the on-chain programs re-validate the account they receive against their own `associated_token::authority` and `token::authority` constraints, so this decides whether a multisig can use an endpoint at all, not who is allowed to do what.
