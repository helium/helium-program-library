#!/usr/bin/env bash
# Checks only what a PR changes, so release bookkeeping missed by earlier PRs
# does not fail this one.
#
# Usage: scripts/check-release-bumps.sh <base-ref>
set -uo pipefail

BASE=${1:?usage: $0 <base-ref>}
MERGE_BASE=$(git merge-base "$BASE" HEAD)
fail=0

error() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::$1"
  else
    echo "error: $1"
  fi
  fail=1
}

changed() { git diff --name-only --diff-filter=ACMR "$MERGE_BASE" HEAD -- "$@"; }

# A program source change bumps that program's crate version, so the deployed
# binary can be traced to a release.
for p in $(changed 'programs/*/src/*' | cut -d/ -f2 | sort -u); do
  if ! git diff "$MERGE_BASE" HEAD -- "programs/$p/Cargo.toml" | grep -q '^+version'; then
    error "programs/$p/src changed but programs/$p/Cargo.toml version did not"
  fi
done

# A source change to a published package carries a changeset that names it.
added_changesets=$(git diff --name-only --diff-filter=A "$MERGE_BASE" HEAD -- '.changeset/*.md')
for dir in $(changed 'packages/*/src/*' | cut -d/ -f1-2 | sort -u); do
  [ -f "$dir/package.json" ] || continue
  if [ "$(node -p "require('./$dir/package.json').private === true")" = "true" ]; then
    continue
  fi
  name=$(node -p "require('./$dir/package.json').name")
  # shellcheck disable=SC2086
  if [ -z "$added_changesets" ] || ! grep -q "\"$name\"" $added_changesets; then
    error "$dir/src changed but no new .changeset/*.md names \"$name\". Run: pnpm changeset"
  fi
done

exit $fail
