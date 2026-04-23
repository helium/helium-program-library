# @helium/idls

Compiled Anchor IDL + generated TypeScript types for every program under [`../../programs`](../../programs). Every SDK in this repo depends on this package rather than regenerating types separately.

The IDLs are rebuilt by the `.github/actions/build-anchor` action during CI/publish.
