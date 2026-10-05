# Standards: on-chain programs (`programs/**`)

This file holds what is specific to this repo. It does not repeat generic Anchor security: signer and owner checks, bumps, CPI targets, account lifecycle, and remaining accounts.

## Account initialization

Initialize a new account with `set_inner(AccountV0 { .. })` and list every field. Field-by-field writes hide a field the handler forgot.

## Layout

- A change to an on-chain struct, enum, or array size keeps existing accounts readable. Add new enum variants and error codes last. Add new fields where old data still decodes, or ship a migration with the change.
- Size an account exactly: `8 + size_of` or `INIT_SPACE`. Add slack only for `init_if_needed` or `realloc`, and say what it holds.
- Name a public instruction change `V1` and keep `V0` working until every client moves. List the clients in the PR: SDK, blockchain-api, wallet-app, crons.

## Bindings

- Bind every signed, queued, or oracle-supplied input to the exact account it acts on: the recipient, the task, `queued_at`. A signature valid for one recipient is not valid for another (the 2026-09-14 lazy-distributor drain).
- A service wallet (oracle, fee payer, crank) never pays rent or fees that a user can make it pay. The user repays it, or the instruction refunds it in the same transaction.
- Staking and reward math rules out a second claim for the same period, and checks that a snapshot still matches the deposit it came from.

## Arithmetic

Multiply before you divide. Widen to `u128` before a multiply that can overflow `u64`. Narrow with `try_into()`, never `as`. Keep the failure mode when you change arithmetic: a `checked_*` that returned an error must not become a `saturating_*` that silently clamps (#1254).

## Errors and checks

- Compare with the typed macros: `require_eq!`, `require_keys_eq!`, `require_gt!`, and the others. They log both values. `require!(a == b, ..)` does not.
- Return a named error. Never `unwrap()` in a program.
- Program logs are constant strings. Do not format pubkeys into `msg!`, which costs compute.

## Compute

Load an account once. Use a stored bump, not `find_program_address`. Drop accounts the instruction does not read. Use `init_if_needed` only where a second call is expected.

## Struct order

Put the signers and the payer first in an `#[derive(Accounts)]` struct.

## Devnet and TESTING

Code behind the `devnet` feature or a `TESTING` flag cannot change totals in a mainnet build. Gate it with `#[cfg(feature = "devnet")]`, not a runtime flag.
