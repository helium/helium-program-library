---
"@helium/anchor-resolvers": minor
"@helium/automation-hooks": minor
"@helium/circuit-breaker-sdk": minor
"@helium/data-credits-sdk": minor
"@helium/dc-auto-top-sdk": minor
"@helium/distributor-oracle": minor
"@helium/fanout-sdk": minor
"@helium/helium-admin-cli": minor
"@helium/helium-entity-manager-sdk": minor
"@helium/helium-react-hooks": minor
"@helium/helium-sub-daos-sdk": minor
"@helium/hexboosting-sdk": minor
"@helium/hotspot-utils": minor
"@helium/hpl-crons-sdk": minor
"@helium/idls": minor
"@helium/lazy-distributor-sdk": minor
"@helium/lazy-transactions-sdk": minor
"@helium/mini-fanout-sdk": minor
"@helium/mobile-entity-manager-sdk": minor
"@helium/no-emit-sdk": minor
"@helium/price-oracle-sdk": minor
"@helium/rewards-oracle-sdk": minor
"@helium/spl-utils": minor
"@helium/sus": minor
"@helium/treasury-management-sdk": minor
"@helium/tuktuk-dca-sdk": minor
"@helium/voter-stake-registry-hooks": minor
"@helium/voter-stake-registry-sdk": minor
"@helium/welcome-pack-sdk": minor
---

Move from `@coral-xyz/anchor` to `@anchor-lang/core` 0.31.2, the package Anchor now publishes its TypeScript client under. When a send fails, `AnchorProvider` now returns the program logs and the original error message; 0.31.1 lost both. `sendAndConfirm` and `sendAll` now fetch the blockhash at `commitment` when `preflightCommitment` is not set. The SDKs do not accept types from `@coral-xyz/anchor`, so consumers must import `Program`, `AnchorProvider` and related types from `@anchor-lang/core`. A pnpm or npm override that aliases `@coral-xyz/anchor@^0.31` to `npm:@anchor-lang/core@0.31.2` puts third-party SDKs on the same 0.31.2 code, but as a second module instance: `setProvider` state and `instanceof` checks do not cross between the two package names.
