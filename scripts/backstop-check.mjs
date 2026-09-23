/**
 * Fails a PR that changes a released npm package or a program without
 * declaring a release for it.
 *
 * The backstop behind the changeset bot: the rule is the bot's own fixed step
 * (`missing-changesets.mjs`), so a hand-written changeset and a bot-written one
 * pass alike. It does not care who wrote the file, it runs on drafts, and it
 * runs on forks, where the bot cannot: a fork's token is read-only, so its
 * author reads the fix from this failure.
 */
import { fileURLToPath } from "node:url";

import { missingChangesets, missingFromArgv } from "./missing-changesets.mjs";

const FIX = "write a changeset by hand";

/**
 * @param {{ npm: string[], programs: { name: string }[] }} missing
 * @returns {string | null} the failure text, or null when nothing is missing.
 */
const failureText = ({ npm, programs }) => {
  if (npm.length === 0 && programs.length === 0) return null;
  const lines = [];
  if (npm.length > 0) {
    lines.push(
      `No changeset names ${npm.join(", ")}.`,
      "Add a `.changeset/<id>.md` that names each of them, or an empty changeset when the PR ships no npm code.",
    );
  }
  if (programs.length > 0) {
    lines.push(
      `No program changeset names ${programs.map(({ name }) => name).join(", ")}.`,
      "Add a `.changeset-programs/<id>.md` that names each of them with a level or `none`. An empty changeset does not cover a program.",
    );
  }
  lines.push(FIX);
  return lines.join("\n");
};

/**
 * @param {Parameters<typeof missingChangesets>[0]} input
 * @returns {string | null} the failure text, or null when the PR declares every release.
 */
export const backstopCheck = (input) => failureText(missingChangesets(input));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const failure = failureText(missingFromArgv(process.argv.slice(2)));
    if (failure) {
      process.stderr.write(`${failure}\n`);
      process.exit(1);
    }
    process.stdout.write(
      "Every changed package and program declares a release.\n",
    );
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
