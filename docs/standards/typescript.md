# Standards: TypeScript (`packages/**`, `tests/**`)

## Anchor clients

- Pass only the accounts Anchor cannot resolve, with `.accounts()`. Its type rejects a resolvable account, so the compiler keeps the call short. Use `accountsPartial()` only when you must pass an account Anchor would resolve. Do not use `accountsStrict()`.
- Anchor `Program.idl` names are camelCase in TS. Read a field name from the IDL file. Never recall it (#1332).

## Amounts

Hold token amounts as `BN` or `bigint`. Never `.toNumber()` an amount. Use the real decimals of each mint.

## Transactions

- Cap a builder at the Jito bundle limit (5 transactions). Batch RPC reads with `getMultipleAccounts`. Do not fetch per item.
- Off-chain quotes (fees, rent, amounts) mirror the on-chain rule exactly. When unsure, quote high.
- A server fee-payer key signs only for accounts the server owns. It never signs for an authority the caller can choose.

## Services (blockchain-api and others)

- An expected rejection returns a typed error with a real status code, not a 500 and a Sentry capture (#1232).
- Each API field has one unit and one shape.
- A status change is compare-and-set against stored state. A cursor commits in the same transaction as the data it covers.
- A cache has a TTL. Nothing is memoized for the life of the process.
- Use `Object.hasOwn` or a `Map` for lookups keyed by untrusted input.

## Packages

- Every package an import names is declared in that package's `package.json`.
- The dependency floor of a published package covers every API it calls.
- A change to a published package carries a changeset.
- Prefer named exports in `spl-utils` and SDK index files, so bundles tree-shake.

## React hooks

A hook reports `loading` until every input resolves. It never settles on `0` or `undefined` while an input is still loading.
