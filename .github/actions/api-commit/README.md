# API commit

Commits the checkout's changes through the GitHub GraphQL API
(`createCommitOnBranch`) instead of `git commit` and `git push`. GitHub signs
such a commit with its own key and refuses a custom author, so the commit is
authored by the App's bot user and carries the **Verified** badge. Nothing in
the workflow holds a signing key.

The bots that write a commit use it: the program release PR
(`version-programs.yaml`) and the changeset bot (`changeset-bot-commit.yaml`). The tag
bots still `git push` a lightweight tag, which has no badge to lose.

## Inputs

| Input               | Required | Description                                                                                                                                      |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token`             | yes      | An App installation token with `Contents: write`, from `actions/create-github-app-token`. `GITHUB_TOKEN` would start no downstream workflow run. |
| `branch`            | yes      | The unqualified branch to commit on. It must already exist.                                                                                      |
| `headline`          | yes      | The commit message headline.                                                                                                                     |
| `body`              | no       | The commit message body. Omitted from the message when empty.                                                                                    |
| `expected-head-oid` | yes      | The commit the branch is expected to be at, and the commit the changes are computed against.                                                     |
| `paths`             | no       | Space-separated pathspecs to commit. Empty commits every change in the checkout, drift the build left included.                                  |
| `working-directory` | no       | The checkout to diff and commit, relative to the workspace. Defaults to `.`.                                                                     |

## Outputs

| Output       | Description                                                    |
| ------------ | -------------------------------------------------------------- |
| `commit-oid` | The oid of the commit, empty when there was nothing to commit. |

## Notes

- A moved branch fails the step through `expectedHeadOid`, and the action does
  not retry: the files were computed against the old head, so a later run
  recomputes them. This is the API form of a no-force push.
- `build-payload.sh` turns the worktree into one `fileChanges` object: an
  addition or a change becomes a `FileAddition` with the whole file, a deletion
  becomes a `FileDeletion`, a rename becomes both. File contents reach `jq`
  through `--rawfile` as base64 text, and the request body is a file handed to
  `gh api --input`, so no file content crosses argv, which Linux caps at 128 KiB
  per string. `Cargo.lock` alone is about 117 KB once base64 has grown it.
- `build-payload.sh` has unit tests in `build-payload.test.mjs`: run them with
  `node --test .github/actions/api-commit/build-payload.test.mjs`.
