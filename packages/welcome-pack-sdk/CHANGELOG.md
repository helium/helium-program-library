# Change Log

## 0.12.0

### Minor Changes

- [#1302](https://github.com/helium/helium-program-library/pull/1302) [`7d0fec1`](https://github.com/helium/helium-program-library/commit/7d0fec10a7a979d220f0062dec202ce6372d7071) Thanks [@bryzettler](https://github.com/bryzettler)! - Bump @helium/tuktuk-sdk, @helium/tuktuk-idls and @helium/cron-sdk to ^0.1.1, matching the
  tuktuk 0.2.10 and cron 0.3.1 programs deployed to mainnet in August 2026. The new IDLs decode
  the error codes those releases added and expose queueCronTasksV1 / requeueCronTaskV1.

  `nextAvailableTaskIds` now takes the task queue's `capacity` as a required fourth argument
  (and `random` as the third) so it never returns an id in the bitmap's padding bits past
  capacity, which the program rejects with InvalidTaskId once a queue is nearly full. Every
  call site passes the fetched TaskQueueV0's capacity. `@helium/hpl-crons-sdk` no longer
  ships its own two-argument copy; it re-exports the tuktuk-sdk function.

## 0.11.19

### Patch Changes

- Updated dependencies [[`35e7e30`](https://github.com/helium/helium-program-library/commit/35e7e302596eda528af6d8a327e9bfbb285b789c), [`1e752e6`](https://github.com/helium/helium-program-library/commit/1e752e6af23e3f0f4eb96978c13b7188d6162943), [`991210f`](https://github.com/helium/helium-program-library/commit/991210f9290d8fc97166722489ca511dbbb8194e)]:
  - @helium/idls@0.11.27
  - @helium/lazy-distributor-sdk@0.12.0
  - @helium/spl-utils@0.13.3

## 0.11.18

### Patch Changes

- Updated dependencies [[`79889b1`](https://github.com/helium/helium-program-library/commit/79889b13c1cc3654fa29c02ca5d5a2fc293f0e96), [`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1)]:
  - @helium/idls@0.11.22
  - @helium/spl-utils@0.13.0
  - @helium/lazy-distributor-sdk@0.11.18
  - @helium/mini-fanout-sdk@0.11.18

## 0.11.17

### Patch Changes

- Updated dependencies [[`c6e759e`](https://github.com/helium/helium-program-library/commit/c6e759e421db942e69d6ad357c65d735e0ca2bae)]:
  - @helium/spl-utils@0.12.0
  - @helium/lazy-distributor-sdk@0.11.17
  - @helium/mini-fanout-sdk@0.11.17

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.16](https://github.com/helium/helium-program-library/compare/v0.11.15...v0.11.16) (2026-03-31)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.15](https://github.com/helium/helium-program-library/compare/v0.11.14...v0.11.15) (2026-03-27)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.14](https://github.com/helium/helium-program-library/compare/v0.11.13...v0.11.14) (2026-03-24)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.11](https://github.com/helium/helium-program-libary/compare/v0.11.10...v0.11.11) (2026-02-11)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.10](https://github.com/helium/helium-program-libary/compare/v0.11.9...v0.11.10) (2026-02-04)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.9](https://github.com/helium/helium-program-libary/compare/v0.11.8...v0.11.9) (2026-02-03)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.8](https://github.com/helium/helium-program-libary/compare/v0.11.7...v0.11.8) (2026-01-30)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.7](https://github.com/helium/helium-program-libary/compare/v0.11.6...v0.11.7) (2025-12-16)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.6](https://github.com/helium/helium-program-libary/compare/v0.11.5...v0.11.6) (2025-10-27)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.5](https://github.com/helium/helium-program-libary/compare/v0.11.4...v0.11.5) (2025-10-13)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.4](https://github.com/helium/helium-program-libary/compare/v0.11.3...v0.11.4) (2025-09-22)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.3](https://github.com/helium/helium-program-libary/compare/v0.11.2...v0.11.3) (2025-09-18)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.2](https://github.com/helium/helium-program-libary/compare/v0.11.1...v0.11.2) (2025-09-18)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.11.1](https://github.com/helium/helium-program-libary/compare/v0.11.0...v0.11.1) (2025-09-18)

**Note:** Version bump only for package @helium/welcome-pack-sdk

# [0.11.0](https://github.com/helium/helium-program-libary/compare/v0.10.35...v0.11.0) (2025-09-17)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.35](https://github.com/helium/helium-program-libary/compare/v0.10.34...v0.10.35) (2025-08-19)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.34](https://github.com/helium/helium-program-libary/compare/v0.10.33...v0.10.34) (2025-08-05)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.33](https://github.com/helium/helium-program-libary/compare/v0.10.32...v0.10.33) (2025-08-01)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.32](https://github.com/helium/helium-program-libary/compare/v0.10.31...v0.10.32) (2025-08-01)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.31](https://github.com/helium/helium-program-libary/compare/v0.10.30...v0.10.31) (2025-08-01)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.30](https://github.com/helium/helium-program-libary/compare/v0.10.29...v0.10.30) (2025-07-16)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.29](https://github.com/helium/helium-program-libary/compare/v0.10.28...v0.10.29) (2025-07-15)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.28](https://github.com/helium/helium-program-libary/compare/v0.10.27...v0.10.28) (2025-07-11)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.27](https://github.com/helium/helium-program-libary/compare/v0.10.26...v0.10.27) (2025-07-09)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.26](https://github.com/helium/helium-program-libary/compare/v0.10.25...v0.10.26) (2025-07-07)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.25](https://github.com/helium/helium-program-libary/compare/v0.10.24...v0.10.25) (2025-07-02)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.24](https://github.com/helium/helium-program-libary/compare/v0.10.23...v0.10.24) (2025-07-02)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.23](https://github.com/helium/helium-program-libary/compare/v0.10.22...v0.10.23) (2025-07-02)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.22](https://github.com/helium/helium-program-libary/compare/v0.10.21...v0.10.22) (2025-07-01)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.21](https://github.com/helium/helium-program-libary/compare/v0.10.20...v0.10.21) (2025-07-01)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.20](https://github.com/helium/helium-program-libary/compare/v0.10.19...v0.10.20) (2025-07-01)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.19](https://github.com/helium/helium-program-libary/compare/v0.10.17...v0.10.19) (2025-06-26)

**Note:** Version bump only for package @helium/welcome-pack-sdk

## [0.10.17] (2025-06-10)

- Initial creation of @helium/welcome-pack-sdk, based on mini-fanout-sdk structure.

## [0.10.17](https://github.com/helium/helium-program-libary/compare/v0.10.16...v0.10.17) (2025-06-10)

**Note:** Version bump only for package @helium/mini-fanout-sdk
