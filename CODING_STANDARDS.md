# Coding standards

Read during review, not implementation. Each rule is a judgement call that no linter can make. Rules a tool can check live in CI, not here (see "Enforced by tooling" at the end).

Read the area file for each area the diff touches:

- `programs/**` → `docs/standards/programs.md`
- `packages/**` TypeScript, `tests/**` → `docs/standards/typescript.md`
- `utils/**` and other Rust services → `docs/standards/rust-services.md`

The rules below apply to every diff.

## Claims

Comments, changesets, READMEs, and PR bodies state only what the code enforces today. Write a comment as the rule the code keeps ("the oracle never pays rent"), not as a story of the change. A claim that no test or run proves goes out, or gets the test. Three reviewers flagged overclaims on more than 12 PRs (#1286, #1327, #1343, tuktuk#113).

## Tests

- The expected value comes from the spec or from an independent calculation. Never derive it by running the code under test, and never weaken an assertion or turn a throw into a skip to reach green (#1304).
- A test calls the production path. A test double that copies production logic proves the copy, not the code (#1299, #1332).
- Assert exact values: the exact amount, the exact error variant. Use `greaterThan`/`lessThan` only for values that are non-deterministic (timestamps, randomness), and say why in a comment.
- After an instruction, fetch the resulting accounts and assert their state. A successful send proves nothing about state.
- A new test file runs in CI. A blockchain-api e2e file goes in the matrix in `.github/workflows/blockchain-api-e2e.yml` (CI checks this). A test file anywhere else needs the same care: say in the PR which job runs it (#1286, #1336, #1344).
- Byte sizes and rent constants are asserted against a real chain (e2e), not recalled.

## Failure

Fail closed and loud. An expected rejection returns a named error. An unexpected one propagates. An empty `catch`, a fallback to a default, or a "continue on error" flag needs a comment that names who notices the failure. An unset env var fails at startup. It never falls back to mainnet constants (#1299).

## Reuse

Before writing a helper, search for it. The usual homes:

- TS: `@helium/spl-utils`, `@helium/currency-utils`, `@helium/hotspot-utils`, the `*-sdk` package of the program, `tests/utils`. Decode accounts with `program.coder`, not a hand-written layout.
- Rust: the `*_seeds!` macros in each program's `state.rs`, the shared modules of the program, `shared-utils`.

A helper that exists in HPL but is not exported gets exported, not copied (wallet-app#906).

## Names

Name an account or field by its role: `hnt_mint`, not `mint`. Use one name for one concept across Rust, TS, SQL, and env (`rent_refund`, #1197).

## Scope

One PR, one concern. Leave out lockfile churn, tooling directories (`.claude/`), submodule bumps, unrelated formatting, and speculative exports, inputs, or fields that nothing calls yet. Every PR has a body that says why.

## Constants

Every emissions, fee, or funds constant shows its derivation in a comment: the HIP it comes from and the arithmetic (per-epoch × days = annual). A change to a tuned constant says why in the PR body.

## Enforced by tooling

CI checks these. Do not report what they catch:

- rustfmt and clippy.
- blockchain-api lint, typecheck, and the e2e matrix list (`.github/workflows/blockchain-api-e2e.yml`).
- `scripts/check-release-bumps.sh`, on PRs into develop:
  - a change under `programs/<p>/src` bumps `programs/<p>/Cargo.toml` `version`. Changes to shared crates under `utils/` (e.g. shared-utils) are not checked; bump the programs that ship the change by hand;
  - a change under the `src/` of a published package has a changeset that names it.
- An IDL change has an `@helium/idls` changeset.
