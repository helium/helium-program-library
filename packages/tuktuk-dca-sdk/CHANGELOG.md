# Change Log

## 0.12.0

### Minor Changes

- [#1345](https://github.com/helium/helium-program-library/pull/1345) [`0888cd5`](https://github.com/helium/helium-program-library/commit/0888cd5ccae217e3b4c07e18459cc9f6ef2dbfc0) Thanks [@bryzettler](https://github.com/bryzettler)! - Move from `@coral-xyz/anchor` to `@anchor-lang/core` 0.31.2, the package Anchor now publishes its TypeScript client under. When a transaction lands and then fails, `sendAndConfirm` and `sendAll` now throw a `SendTransactionError` that holds the program logs and the original error message. Errors from `simulate` now also hold the program logs. With `@solana/web3.js` 1.92 or later, 0.31.1 lost them. Preflight failures are unchanged. `sendAndConfirm` and `sendAll` now fetch the blockhash at `commitment` when `preflightCommitment` is not set. SDK functions typed on `Program` reject a `Program` built from `@coral-xyz/anchor`, so consumers must import `Program` from `@anchor-lang/core`. A provider or IDL from either package is accepted. A pnpm or npm override can alias `@coral-xyz/anchor@^0.31` to `npm:@anchor-lang/core@0.31.2`. This override puts third-party SDKs on the same 0.31.2 code. Under npm, or pnpm with `node-linker=hoisted`, the override installs a second copy of the module, and `setProvider` state and `instanceof` checks do not cross between the two package names. Under the default pnpm linker, both names load one copy.

### Patch Changes

- Updated dependencies [[`0888cd5`](https://github.com/helium/helium-program-library/commit/0888cd5ccae217e3b4c07e18459cc9f6ef2dbfc0), [`6f11300`](https://github.com/helium/helium-program-library/commit/6f11300031422e9468dc9c0ad813fad9eaa76d3c), [`b26c94b`](https://github.com/helium/helium-program-library/commit/b26c94b2447cdc03eb0b997e7efcae7ed2891325), [`a9b1301`](https://github.com/helium/helium-program-library/commit/a9b13019bb52e8e9015f3fcfaabb4308c8aeddc6), [`4dbe762`](https://github.com/helium/helium-program-library/commit/4dbe762512abea5d53f4ca59d96385a158c7f283)]:
  - @helium/anchor-resolvers@0.12.0
  - @helium/idls@0.12.0
  - @helium/spl-utils@0.14.0

## 0.11.18

### Patch Changes

- Updated dependencies [[`79889b1`](https://github.com/helium/helium-program-library/commit/79889b13c1cc3654fa29c02ca5d5a2fc293f0e96), [`580baa2`](https://github.com/helium/helium-program-library/commit/580baa257ffcc4ce593d9caeba9d096ba9a288a1)]:
  - @helium/idls@0.11.22
  - @helium/spl-utils@0.13.0

## 0.11.17

### Patch Changes

- Updated dependencies [[`c6e759e`](https://github.com/helium/helium-program-library/commit/c6e759e421db942e69d6ad357c65d735e0ca2bae)]:
  - @helium/spl-utils@0.12.0

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.16](https://github.com/helium/helium-program-library/compare/v0.11.15...v0.11.16) (2026-03-31)

**Note:** Version bump only for package @helium/tuktuk-dca-sdk

## [0.11.15](https://github.com/helium/helium-program-library/compare/v0.11.14...v0.11.15) (2026-03-27)

**Note:** Version bump only for package @helium/tuktuk-dca-sdk

## [0.11.14](https://github.com/helium/helium-program-library/compare/v0.11.13...v0.11.14) (2026-03-24)

**Note:** Version bump only for package @helium/tuktuk-dca-sdk

## [0.11.13](https://github.com/helium/helium-program-library/compare/v0.11.12...v0.11.13) (2026-03-19)

**Note:** Version bump only for package @helium/tuktuk-dca-sdk

## [0.11.12](https://github.com/helium/helium-program-library/compare/v0.11.11...v0.11.12) (2026-03-17)

**Note:** Version bump only for package @helium/tuktuk-dca-sdk
