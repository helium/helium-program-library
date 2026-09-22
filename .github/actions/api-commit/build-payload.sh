#!/usr/bin/env bash
#
# Builds the GraphQL request body for `createCommitOnBranch` out of the
# worktree's changes against EXPECTED_HEAD_OID and writes it to stdout. Writes
# nothing and exits 0 when there is nothing to commit.
#
# Inputs (environment): GITHUB_REPOSITORY, BRANCH, EXPECTED_HEAD_OID, HEADLINE,
# and the optional BODY. The working directory is the checkout to commit.
#
# File contents reach jq through --rawfile and the body reaches `gh` on stdin,
# so no file ever crosses argv: Linux caps one argv string at 128 KiB and
# Cargo.lock alone is about 117 KB once base64 has grown it.
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

git add -A
changes=$(git diff --cached --name-status "$EXPECTED_HEAD_OID")
if [ -z "$changes" ]; then
  exit 0
fi

file_changes=$(mktemp)
trap 'rm -f "$file_changes" "$file_changes.next"' EXIT
echo '{"additions":[],"deletions":[]}' >"$file_changes"

# An addition and a change are the same mutation: a FileAddition replaces
# whatever is at the path. A rename is a deletion plus an addition.
add() {
  jq --rawfile contents "$1" --arg path "$1" \
    '.additions += [{path: $path, contents: ($contents | @base64)}]' \
    "$file_changes" >"$file_changes.next"
  mv "$file_changes.next" "$file_changes"
}
remove() {
  jq --arg path "$1" '.deletions += [{path: $path}]' \
    "$file_changes" >"$file_changes.next"
  mv "$file_changes.next" "$file_changes"
}

while IFS=$'\t' read -r status first second; do
  case "$status" in
    A | M) add "$first" ;;
    D) remove "$first" ;;
    R*)
      remove "$first"
      add "$second"
      ;;
    *)
      echo "::error::unhandled status $status for $first" >&2
      exit 1
      ;;
  esac
done <<<"$changes"

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
