# Change Log

## 0.12.1

### Patch Changes

- [#1399](https://github.com/helium/helium-program-library/pull/1399) [`cbd5a8f`](https://github.com/helium/helium-program-library/commit/cbd5a8fa0784975cd7a4314a96a7e31797511fc2) Thanks [@bryzettler](https://github.com/bryzettler)! - Bound DCA routes with maxAccounts 20 as well as maxBytes 520, and measure the crank turner's transaction (compute budget, ed25519 check and run_task_v0) before answering. When it is over 1232 bytes, build the swap once more with maxBytes lowered by the overshoot, and refuse the order when it still does not fit.

## 0.12.0

### Minor Changes

- [#1394](https://github.com/helium/helium-program-library/pull/1394) [`08fe42c`](https://github.com/helium/helium-program-library/commit/08fe42ca2c47070e74ffc1e9d686ae8c4da89f36) Thanks [@madninja](https://github.com/madninja)! - The DCA service builds each order's swap through Jupiter's Swap V2 `GET /swap/v2/build` instead of `/swap/v1/quote` and `POST /swap/v1/swap-instructions`. The swap payer PDA is the taker, and `maxBytes` of 520 replaces `onlyDirectRoutes`, which `/build` does not take: it aims to keep the bare swap small enough that the crank turner's task transaction, which carries the swap again inside the signed remote task, stays under 1232 bytes. A `/build` answer that fails validation, swaps other mints or another amount than the order, routes through Jupiter RFQ v2 (which every request excludes), or carries `otherInstructions` is refused. A build whose setup holds a System Program instruction, or creates an associated token account that does not exist yet, is refused, because the swap payer PDA would pay for it. Jupiter's compute budget instructions are left out of the task, and the lookup tables are returned by key. The package gains a `test` script for its unit tests. `JUPITER_API_URL` now defaults to `https://api.jup.ag` instead of `https://lite-api.jup.ag`, the service warns at start when `JUPITER_API_KEY` is not set, and the unused `@jup-ag/core` dependency is removed.

## 0.11.25

### Patch Changes

- Updated dependencies [[`a2c4c17`](https://github.com/helium/helium-program-library/commit/a2c4c1781fde099142fb437825df591d133cb4c3)]:
  - @helium/spl-utils@0.16.0
  - @helium/tuktuk-dca-sdk@0.12.2

## 0.11.24

### Patch Changes

- [#1322](https://github.com/helium/helium-program-library/pull/1322) [`eb7ab89`](https://github.com/helium/helium-program-library/commit/eb7ab8923da347ca11ded2a94dd5414cb91e835a) Thanks [@bryzettler](https://github.com/bryzettler)! - Move the service to Fastify 5

## 0.11.23

### Patch Changes

- [#1367](https://github.com/helium/helium-program-library/pull/1367) [`e7a9362`](https://github.com/helium/helium-program-library/commit/e7a936255322fb4e4541d7b43525880a175d20fd) Thanks [@bryzettler](https://github.com/bryzettler)! - Use finalized commitment in place of confirmed now that mainnet runs Alpenglow.

## 0.11.22

### Patch Changes

- Updated dependencies [[`c0235ed`](https://github.com/helium/helium-program-library/commit/c0235ed8d17e48cd9177dcfd3635352bde70582c), [`6a22e08`](https://github.com/helium/helium-program-library/commit/6a22e08060b9470ae65a8a447c22157f436e7973)]:
  - @helium/spl-utils@0.15.0
  - @helium/tuktuk-dca-sdk@0.12.1

## 0.11.21

### Patch Changes

- Updated dependencies [[`0888cd5`](https://github.com/helium/helium-program-library/commit/0888cd5ccae217e3b4c07e18459cc9f6ef2dbfc0), [`6f11300`](https://github.com/helium/helium-program-library/commit/6f11300031422e9468dc9c0ad813fad9eaa76d3c), [`a9b1301`](https://github.com/helium/helium-program-library/commit/a9b13019bb52e8e9015f3fcfaabb4308c8aeddc6), [`4dbe762`](https://github.com/helium/helium-program-library/commit/4dbe762512abea5d53f4ca59d96385a158c7f283)]:
  - @helium/spl-utils@0.14.0
  - @helium/tuktuk-dca-sdk@0.12.0

## 0.11.20

### Patch Changes

- [#1315](https://github.com/helium/helium-program-library/pull/1315) [`57dfecb`](https://github.com/helium/helium-program-library/commit/57dfecbf6a9325baff1330708c1c0c0b93d3d596) Thanks [@madninja](https://github.com/madninja)! - Bind the DCA swap endpoint to the task and queue named by the DCA account: the request's task, task_queue and task_queued_at must match next_task, task_queue and queued_at, and the swap payer is derived from the account's task queue.

## 0.11.19

### Patch Changes

- [#1302](https://github.com/helium/helium-program-library/pull/1302) [`7d0fec1`](https://github.com/helium/helium-program-library/commit/7d0fec10a7a979d220f0062dec202ce6372d7071) Thanks [@bryzettler](https://github.com/bryzettler)! - Bump @helium/tuktuk-sdk, @helium/tuktuk-idls and @helium/cron-sdk to ^0.1.1. The delegate
  endpoint keeps returning BAD_REQUEST when the automation task queue has fewer free slots
  than positions, now that `nextAvailableTaskIds` throws instead of returning a short list.

## 0.11.18

### Patch Changes

- Updated dependencies [[`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1)]:
  - @helium/spl-utils@0.13.0
  - @helium/tuktuk-dca-sdk@0.11.18

## 0.11.17

### Patch Changes

- Updated dependencies [[`c6e759e`](https://github.com/helium/helium-program-library/commit/c6e759e421db942e69d6ad357c65d735e0ca2bae)]:
  - @helium/spl-utils@0.12.0
  - @helium/tuktuk-dca-sdk@0.11.17

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.16](https://github.com/helium/helium-program-library/compare/v0.11.15...v0.11.16) (2026-03-31)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.15](https://github.com/helium/helium-program-library/compare/v0.11.14...v0.11.15) (2026-03-27)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.14](https://github.com/helium/helium-program-library/compare/v0.11.13...v0.11.14) (2026-03-24)

### Bug Fixes

- process inner instructions in Solana execution order ([#1153](https://github.com/helium/helium-program-library/issues/1153)) ([6162ddf](https://github.com/helium/helium-program-library/commit/6162ddf3658c91fe853e5826c41f55bbf2be046a))

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.11](https://github.com/helium/helium-program-libary/compare/v0.11.10...v0.11.11) (2026-02-11)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.10](https://github.com/helium/helium-program-libary/compare/v0.11.9...v0.11.10) (2026-02-04)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.9](https://github.com/helium/helium-program-libary/compare/v0.11.8...v0.11.9) (2026-02-03)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.8](https://github.com/helium/helium-program-libary/compare/v0.11.7...v0.11.8) (2026-01-30)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.7](https://github.com/helium/helium-program-libary/compare/v0.11.6...v0.11.7) (2025-12-16)

**Note:** Version bump only for package @helium/tuktuk-dca-service

## [0.11.6](https://github.com/helium/helium-program-libary/compare/v0.11.5...v0.11.6) (2025-10-27)

**Note:** Version bump only for package @helium/tuktuk-dca-service

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.5] - 2024-01-XX

### Added

- Initial release of Tuktuk DCA Service
- Jupiter API integration for swap quotes and transactions
- DCA swap endpoint with Tuktuk integration
- Health check endpoint
- Docker support
- Environment variable configuration
