# Program changesets

The Anchor programs carry no `package.json`, so they do not use changesets. A
**program changeset** in this directory does the same job for one program:
it names the release level and holds the text the Squads signer reads.

`.changeset/` stays for the npm packages. A PR that changes a program and its
IDL gets one file in each directory.

This `README.md` keeps the directory in git when the last program changeset is
consumed. The version script that part 2 adds later skips it.

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
directory names. An unknown name fails the version step that part 2 adds later.

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
hand decision; the changeset bot that part 2 adds later never writes it.

## `none`

`none` means "this change ships nothing on chain". No version bump and no
changelog entry. The commit that adds the `<program>: none` line is the
program's reviewed commit. The missing-bump check reads it from git history and
asks for a bump only when the program changed since both its tag and that
commit. Nobody records the commit by hand, and a squash merge keeps it as the
squash commit.

A `none` review covers the program only up to that commit. A later change to the
program needs a new program changeset; rewording the old one reviews nothing.

A program is marked changed by its own source, by the source of a workspace
crate it depends on, by a `Cargo.lock` change to a dependency it resolves, or by
a change to the `[profile.*]` tables of the root `Cargo.toml`, which marks every
program.

The changeset bot that part 2 adds later never writes `none`. It writes `patch`
for every program marked through a workspace dependency, `Cargo.lock`, or a
`Cargo.toml` profile, and a person may lower it to `none` with a reason. A
person may write `none` anywhere.

## Releasing

The version step ships later. Until then, the author bumps the program's
version in its `Cargo.toml` by hand. After the bump reaches `master`, the author
pushes the `program-<name>-<version>` tag by hand. That tag starts the deploy.
