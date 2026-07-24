# Change Log

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
