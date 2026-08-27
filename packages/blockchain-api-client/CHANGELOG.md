# Change Log

## 0.14.4

### Patch Changes

- [#1276](https://github.com/helium/helium-program-library/pull/1276) [`d917896`](https://github.com/helium/helium-program-library/commit/d917896aeb9defe0a67fe293451ecdb1e9c00418) Thanks [@bryzettler](https://github.com/bryzettler)! - Add `deriveLoadedAccountsDataSizeLimit` opt-out to `withPriorityFees` and `batchInstructionsToTxsWithPriorityFee`, and disable sim-derived loaded-accounts-data-size limits on wallet-signed transactions in blockchain-api, distributor-oracle, and voter-stake-registry-hooks. Wallets append guard instructions (Lighthouse) after sizing, which exceeded the derived limit and failed with `MaxLoadedAccountsDataSizeExceeded`.

## 0.14.3

### Patch Changes

- [#1269](https://github.com/helium/helium-program-library/pull/1269) [`7dcdd47`](https://github.com/helium/helium-program-library/commit/7dcdd47419a0b71eef8f1ef4e5aacf35282d27bd) Thanks [@bryzettler](https://github.com/bryzettler)! - Widen transaction batch tags to TEXT, bound the contract tag at 1000 chars, back off per-batch resubmissions, and clamp migration SOL transfers to the live source balance

## 0.14.2

### Patch Changes

- [#1232](https://github.com/helium/helium-program-library/pull/1232) [`adb63c2`](https://github.com/helium/helium-program-library/commit/adb63c2c5c2e15d45cf5a2a102bbeba6fa2a31a1) Thanks [@madninja](https://github.com/madninja)! - Let a multisig-held wallet use the governance endpoints. A Squads vault owns its assets through a program address, and eleven call sites derived associated token addresses without `allowOwnerOffCurve`, so `getAssociatedTokenAddressSync` threw `TokenOwnerOffCurveError` and failed the whole request rather than one derivation.

  `buildClaimInstructions` is one of them, and the claim, undelegate and delegate procedures all call it first, so claiming delegation rewards, undelegating, and re-delegating an expired position were unavailable to every vault-held veHNT position that had an unclaimed epoch. `delegate.ts` also derived the reward account this way when enabling autoclaim, so a vault could not turn automation back on.

  The derived address is identical either way and the on-chain programs re-validate the account they receive against their own `associated_token::authority` and `token::authority` constraints, so this decides whether a multisig can use an endpoint at all, not who is allowed to do what.

## 0.14.1

### Patch Changes

- [#1229](https://github.com/helium/helium-program-library/pull/1229) [`f64a0ea`](https://github.com/helium/helium-program-library/commit/f64a0ea9df61e2e52710e1cdcee7d4bd3c02e7f9) Thanks [@allenan](https://github.com/allenan)! - Stop tracing middleware in Sentry. The edge runtime's `tracesSampleRate: 1` emitted 155,763 bare `middleware GET` / `middleware POST` transactions in the 2026-07-12 billing period, duplicating timing the route transaction already records. That was 40% of this service's transaction volume and the largest single contributor to exhausting the org's shared 500k quota nine days into a thirty-day period, which rate-limits performance data for every other project in the org. Error reporting from middleware is unaffected.

## 0.14.0

### Minor Changes

- [#1206](https://github.com/helium/helium-program-library/pull/1206) [`77df26b`](https://github.com/helium/helium-program-library/commit/77df26b20ce9922b11f6b6e36b9f45b1a723e8bc) Thanks [@bryzettler](https://github.com/bryzettler)! - Add `governance.getPositions` (GET /positions/wallet/{wallet}) listing a wallet's voter-stake-registry positions with deposited amount, governing mint, and lockup info. Governance and migration contracts now also declare `RATE_LIMITED` errors.

## 0.13.0

### Minor Changes

- [#1224](https://github.com/helium/helium-program-library/pull/1224) [`a5d7e07`](https://github.com/helium/helium-program-library/commit/a5d7e073f3da1ab87816c982ec723c7e2158a5ac) Thanks [@bryzettler](https://github.com/bryzettler)! - Governance vote-building now reports skipped positions instead of silently dropping them. The vote response gains a `skipped: [{ positionMint, reason }]` array (reasons `maxChoicesReached` and `alreadyVotedThisChoice`), and the all-positions-skipped case throws a new `ALL_POSITIONS_SKIPPED` error carrying the same skip report. Additive change — existing consumers keep working.

## 0.12.0

### Minor Changes

- [#1223](https://github.com/helium/helium-program-library/pull/1223) [`9431155`](https://github.com/helium/helium-program-library/commit/943115570fc36650cdc83471fdf1ca66c491e6bb) Thanks [@madninja](https://github.com/madninja)! - Allow veHNT position transfer to a target position owned by another wallet. `positions/transfer` no longer requires the caller to own the target position, matching the on-chain `transferV0` constraint, and adds registrar/voting-mint-config compatibility checks between source and target.

## 0.11.18

### Patch Changes

- [`f290e9b`](https://github.com/helium/helium-program-library/commit/f290e9bd0fe4fe92b1848983aeee80547de1fd2c) Thanks [@ChewingGlass](https://github.com/ChewingGlass)! - Add multi transfer

## 0.11.17

### Patch Changes

- [#1171](https://github.com/helium/helium-program-library/pull/1171) [`97e4704`](https://github.com/helium/helium-program-library/commit/97e4704468ea44b153451b4e0a620db553f188bc) Thanks [@bryzettler](https://github.com/bryzettler)! - Fix Sentry errors with accurate fee calculations and ATA checks, and enrich actionMetadata with hotspot names, split details, and estimated pending rewards

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.16](https://github.com/helium/helium-program-library/compare/v0.11.15...v0.11.16) (2026-03-31)

**Note:** Version bump only for package @helium/blockchain-api

## [0.11.15](https://github.com/helium/helium-program-library/compare/v0.11.14...v0.11.15) (2026-03-27)

**Note:** Version bump only for package @helium/blockchain-api

## [0.11.14](https://github.com/helium/helium-program-library/compare/v0.11.13...v0.11.14) (2026-03-24)

**Note:** Version bump only for package @helium/blockchain-api

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/blockchain-api

## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)

**Note:** Version bump only for package @helium/blockchain-api
