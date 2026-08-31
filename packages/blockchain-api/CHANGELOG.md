# Change Log

## 0.11.24

### Patch Changes

- Updated dependencies [[`c31dc01`](https://github.com/helium/helium-program-library/commit/c31dc01c35ebef6fd676e75451dddbefdcad5545)]:
  - @helium/blockchain-api@0.15.0

## 0.11.23

### Patch Changes

- [#1269](https://github.com/helium/helium-program-library/pull/1269) [`7dcdd47`](https://github.com/helium/helium-program-library/commit/7dcdd47419a0b71eef8f1ef4e5aacf35282d27bd) Thanks [@bryzettler](https://github.com/bryzettler)! - Widen transaction batch tags to TEXT, bound the contract tag at 1000 chars, back off per-batch resubmissions, and clamp migration SOL transfers to the live source balance

- Updated dependencies [[`7dcdd47`](https://github.com/helium/helium-program-library/commit/7dcdd47419a0b71eef8f1ef4e5aacf35282d27bd)]:
  - @helium/blockchain-api@0.14.3

## 0.11.22

### Patch Changes

- [#1207](https://github.com/helium/helium-program-library/pull/1207) [`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1) Thanks [@bryzettler](https://github.com/bryzettler)! - Pyth pro migration service updates: monitor-service gains pyth crank/payer balance and feed publish-time gauges, tuktuk-pyth-service crank hardening, and blockchain-api drops the Hermes ephemeral price-update path from DC mints.

- Updated dependencies [[`79889b1`](https://github.com/helium/helium-program-library/commit/79889b13c1cc3654fa29c02ca5d5a2fc293f0e96), [`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1), [`c49ab38`](https://github.com/helium/helium-program-library/commit/c49ab38eb4a710d50bd905465e8b3041a74aeb9a)]:
  - @helium/idls@0.11.22
  - @helium/spl-utils@0.13.0
  - @helium/data-credits-sdk@0.12.0
  - @helium/helium-sub-daos-sdk@0.11.19
  - @helium/circuit-breaker-sdk@0.11.18
  - @helium/distributor-oracle@0.11.19
  - @helium/helium-entity-manager-sdk@0.11.18
  - @helium/hpl-crons-sdk@0.11.19
  - @helium/lazy-distributor-sdk@0.11.18
  - @helium/mini-fanout-sdk@0.11.18
  - @helium/sus@0.11.18
  - @helium/voter-stake-registry-sdk@0.12.2
  - @helium/welcome-pack-sdk@0.11.18

## 0.11.21

### Patch Changes

- [#1201](https://github.com/helium/helium-program-library/pull/1201) [`2022672`](https://github.com/helium/helium-program-library/commit/2022672309d34fb95d20b6b45f6ac88b72755ef2) Thanks [@bryzettler](https://github.com/bryzettler)! - Price transactions with the cluster's own fee calculation instead of local compute-budget math. `getTransactionFee`/`getTotalTransactionFees` now take a `Connection` and resolve via `getFeeForMessage`, so quoted fees track base, priority, and any future fee components (SIMD-0553 resource fees) without client-side modeling. The local fallback used when the RPC can't answer parses the u64 CU price without the signed-shift overflow past 2^31 and models the runtime's 200k-per-instruction default (capped at 1.4M) rather than a flat 200k.

  `buildVersionedTransaction` resolves address lookup tables once and shares them with `withPriorityFees` and the message compile, fetches the blockhash concurrently with fee estimation, and on estimation failure falls back to spl-utils' measured compute-unit table instead of shipping instructions with no compute budget. Hardcoded 500k compute-unit limits are dropped from the remaining procedures.

- Updated dependencies [[`c6e759e`](https://github.com/helium/helium-program-library/commit/c6e759e421db942e69d6ad357c65d735e0ca2bae)]:
  - @helium/spl-utils@0.12.0
  - @helium/circuit-breaker-sdk@0.11.17
  - @helium/data-credits-sdk@0.11.17
  - @helium/distributor-oracle@0.11.17
  - @helium/helium-entity-manager-sdk@0.11.17
  - @helium/helium-sub-daos-sdk@0.11.18
  - @helium/hpl-crons-sdk@0.11.18
  - @helium/lazy-distributor-sdk@0.11.17
  - @helium/mini-fanout-sdk@0.11.17
  - @helium/sus@0.11.17
  - @helium/voter-stake-registry-sdk@0.12.1
  - @helium/welcome-pack-sdk@0.11.17

## 0.11.20

### Patch Changes

- Updated dependencies [[`77df26b`](https://github.com/helium/helium-program-library/commit/77df26b20ce9922b11f6b6e36b9f45b1a723e8bc)]:
  - @helium/blockchain-api@0.14.0

## 0.11.19

### Patch Changes

- Updated dependencies [[`a5d7e07`](https://github.com/helium/helium-program-library/commit/a5d7e073f3da1ab87816c982ec723c7e2158a5ac), [`a5d7e07`](https://github.com/helium/helium-program-library/commit/a5d7e073f3da1ab87816c982ec723c7e2158a5ac)]:
  - @helium/voter-stake-registry-sdk@0.12.0
  - @helium/blockchain-api@0.13.0
  - @helium/helium-sub-daos-sdk@0.11.17
  - @helium/hpl-crons-sdk@0.11.17

## 0.11.18

### Patch Changes

- Updated dependencies [[`9431155`](https://github.com/helium/helium-program-library/commit/943115570fc36650cdc83471fdf1ca66c491e6bb)]:
  - @helium/blockchain-api@0.12.0

## 0.11.17

### Patch Changes

- [#1171](https://github.com/helium/helium-program-library/pull/1171) [`97e4704`](https://github.com/helium/helium-program-library/commit/97e4704468ea44b153451b4e0a620db553f188bc) Thanks [@bryzettler](https://github.com/bryzettler)! - Fix Sentry errors with accurate fee calculations and ATA checks, and enrich actionMetadata with hotspot names, split details, and estimated pending rewards

- Updated dependencies [[`97e4704`](https://github.com/helium/helium-program-library/commit/97e4704468ea44b153451b4e0a620db553f188bc)]:
  - @helium/blockchain-api@0.11.17
  - @helium/spl-utils@0.11.17

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.16](https://github.com/helium/helium-program-library/compare/v0.11.15...v0.11.16) (2026-03-31)

### Features

- add DC token to KNOWN_TOKENS with hardcoded price ([#1159](https://github.com/helium/helium-program-library/issues/1159)) ([5c570e6](https://github.com/helium/helium-program-library/commit/5c570e66f7c7ec678cd4e7c5d5091877c531b342))

## [0.11.15](https://github.com/helium/helium-program-library/compare/v0.11.14...v0.11.15) (2026-03-27)

**Note:** Version bump only for package @helium/blockchain-api-service

## [0.11.14](https://github.com/helium/helium-program-library/compare/v0.11.13...v0.11.14) (2026-03-24)

### Bug Fixes

- process inner instructions in Solana execution order ([#1153](https://github.com/helium/helium-program-library/issues/1153)) ([6162ddf](https://github.com/helium/helium-program-library/commit/6162ddf3658c91fe853e5826c41f55bbf2be046a))

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/blockchain-api-service

## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)

**Note:** Version bump only for package @helium/blockchain-api-service
