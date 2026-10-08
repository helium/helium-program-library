#!/usr/bin/env bash
# Checks only what a PR changes, so release bookkeeping missed by earlier PRs
# does not fail this one.
#
# Usage: scripts/check-release-bumps.sh <base-ref>
set -uo pipefail

BASE=${1:?usage: $0 <base-ref>}
MERGE_BASE=$(git merge-base "$BASE" HEAD) || { echo "error: cannot resolve merge base of $BASE" >&2; exit 2; }
fail=0

error() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::$1"
  else
    echo "error: $1"
  fi
  fail=1
}

changed() { git diff --name-only --diff-filter=ACMRD "$MERGE_BASE" HEAD -- "$@"; }

# A program source change bumps that program's crate version, so the deployed
# binary can be traced to a release. Changes to shared crates under utils/
# (e.g. shared-utils) are not checked; bump the programs that ship the change by hand.
for p in $(changed 'programs/*/src/*' | cut -d/ -f2 | sort -u); do
  [ -f "programs/$p/Cargo.toml" ] || continue
  if ! git diff "$MERGE_BASE" HEAD -- "programs/$p/Cargo.toml" | grep -q '^+version'; then
    error "programs/$p/src changed but programs/$p/Cargo.toml version did not"
  fi
done

# A source change to a published package carries a changeset that names it.
# The changeset can be new, or an unreleased one that this PR edits.
pr_changesets=$(git diff --name-only --diff-filter=AM "$MERGE_BASE" HEAD -- '.changeset/*.md')
for dir in $(changed 'packages/*/src/*' | cut -d/ -f1-2 | sort -u); do
  [ -f "$dir/package.json" ] || continue
  if [ "$(node -p "require('./$dir/package.json').private === true")" = "true" ]; then
    continue
  fi
  name=$(node -p "require('./$dir/package.json').name")
  # shellcheck disable=SC2086
  if [ -z "$pr_changesets" ] || ! grep -q "\"$name\"" $pr_changesets; then
    error "$dir/src changed but no .changeset/*.md added or edited in this PR names \"$name\". Run: pnpm changeset"
  fi
done

exit $fail
