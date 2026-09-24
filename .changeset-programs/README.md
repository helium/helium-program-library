# Program changesets

The Anchor programs carry no `package.json`, so they do not use changesets. A
**program changeset** in this directory does the same job for one program:
it names the release level and holds the text the Squads signer reads.

`.changeset/` stays for the npm packages. A PR that changes a program and its
IDL gets one file in each directory.

This `README.md` keeps the directory in git when the last program changeset is
consumed. The version script skips it, and skips `skipped.json`.

## The file format

Any `<name>.md` in this directory. Front matter of `<program>: <level>` lines,
then the text:

```md
---
lazy-distributor: patch
mini-fanout: minor
---

Bind the oracle signature to the running task.
```

The program names are Cargo package names, which are the `programs/*`
directory names. An unknown name fails the version step.

One file may name several programs, and several files may name the same
program. The highest level per program wins, and every text lands under that
program's one changelog entry.

Write what changed on chain, for the person who signs the Squads upgrade. No PR
numbers and no links.

## The levels

Plain semver arithmetic, with no 0.x special case:

| level   | `0.1.8` becomes |
| ------- | --------------- |
| `patch` | `0.1.9`         |
| `minor` | `0.2.0`         |
| `major` | `1.0.0`         |
| `none`  | `0.1.8`         |

Use `minor` for a new instruction or account, `patch` otherwise. `major` is a
hand decision; the changeset bot never writes it.

## `none`

`none` means "this change ships nothing on chain". No version bump and no
changelog entry. The version script records the program and the commit it was
reviewed up to in `skipped.json`, so the missing-bump check asks for a bump only
when the program changed since both its tag and that commit. The program's next
real release clears the entry.

The changeset bot writes `none` only for a **dependent program** — one marked
changed only through a workspace dependency, where the change cannot reach the
binary. It never writes `none` for a program whose own `src/` changed. A person
may write `none` anywhere.

## Releasing

A push to `develop` with program changesets present runs
`.github/workflows/version-programs.yaml`, which runs
`node scripts/version-programs.mjs` and opens or updates the **program release
PR** from `program-release/develop`. Merging it bumps each `Cargo.toml`, writes
each `programs/<name>/CHANGELOG.md`, and deletes the files used here.

No tag comes from this PR. The tag bot creates `program-<name>-<version>` when
the bump reaches `master`, which is what starts the deploy.
