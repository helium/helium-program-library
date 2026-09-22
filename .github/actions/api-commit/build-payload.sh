#!/usr/bin/env bash
#
# Builds the GraphQL request body for `createCommitOnBranch` out of the
# worktree's changes against EXPECTED_HEAD_OID and writes it to stdout. Writes
# nothing and exits 0 when there is nothing to commit.
#
# Inputs (environment): GITHUB_REPOSITORY, BRANCH, EXPECTED_HEAD_OID, HEADLINE,
# and the optional BODY and PATHS. The working directory is the checkout to
# commit.
#
# File contents reach jq through --rawfile as base64 text, and the body is a
# file handed to `gh api --input`, so no file content ever crosses argv: Linux
# caps one argv string at 128 KiB and Cargo.lock alone is about 117 KB once
# base64 has grown it.
set -euo pipefail

require() {
  if [ -z "${2:-}" ]; then
    echo "::error::$1 is required" >&2
    exit 1
  fi
}
require GITHUB_REPOSITORY "${GITHUB_REPOSITORY:-}"
require branch "${BRANCH:-}"
require expected-head-oid "${EXPECTED_HEAD_OID:-}"
require headline "${HEADLINE:-}"

# PATHS holds space-separated pathspecs, so the commit carries only the files
# the caller meant and not whatever else the build left in the checkout. Empty
# stages everything.
if [ -n "${PATHS:-}" ]; then
  # shellcheck disable=SC2086 # PATHS is a list of pathspecs and must split.
  git add -A -- $PATHS
else
  git add -A
fi
if git diff --cached --quiet "$EXPECTED_HEAD_OID"; then
  exit 0
fi

file_changes=$(mktemp)
changes=$(mktemp)
trap 'rm -f "$file_changes" "$file_changes.next" "$changes"' EXIT
echo '{"additions":[],"deletions":[]}' >"$file_changes"

# An addition and a change are the same mutation: a FileAddition replaces
# whatever is at the path. A rename is a deletion plus an addition. base64
# encodes the file before jq sees it, because --rawfile decodes as UTF-8 and
# would replace the bytes of a binary file with U+FFFD.
add() {
  jq --rawfile contents <(base64 <"$1" | tr -d '\n') --arg path "$1" \
    '.additions += [{path: $path, contents: $contents}]' \
    "$file_changes" >"$file_changes.next"
  mv "$file_changes.next" "$file_changes"
}
remove() {
  jq --arg path "$1" '.deletions += [{path: $path}]' \
    "$file_changes" >"$file_changes.next"
  mv "$file_changes.next" "$file_changes"
}

# NUL-separated records: git C-quotes a path holding a byte >= 0x80, a tab, a
# quote or a backslash unless -z turns the quoting off.
git diff --cached --name-status -z "$EXPECTED_HEAD_OID" >"$changes"
while IFS= read -r -d '' status; do
  IFS= read -r -d '' first
  case "$status" in
    A | M) add "$first" ;;
    D) remove "$first" ;;
    R*)
      IFS= read -r -d '' second
      remove "$first"
      add "$second"
      ;;
    *)
      echo "::error::unhandled status $status for $first" >&2
      exit 1
      ;;
  esac
done <"$changes"

jq -n \
  --arg repo "$GITHUB_REPOSITORY" \
  --arg branch "$BRANCH" \
  --arg head "$EXPECTED_HEAD_OID" \
  --arg headline "$HEADLINE" \
  --arg body "${BODY:-}" \
  --slurpfile fileChanges "$file_changes" \
  '{
    query: "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }",
    variables: {
      input: {
        branch: {repositoryNameWithOwner: $repo, branchName: $branch},
        expectedHeadOid: $head,
        message: ({headline: $headline} + (if $body == "" then {} else {body: $body} end)),
        fileChanges: $fileChanges[0]
      }
    }
  }'
