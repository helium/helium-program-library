/**
 * Lists the program release tags the tag bot must create.
 *
 * A state rule, not an event rule: a program whose `Cargo.toml` version has no
 * `program-<name>-<version>` tag needs one. A failed or missed run is healed by
 * the next run, because the next run sees the same missing tag.
 */
import { fileURLToPath } from "node:url";

import { readPrograms } from "./missing-bump-check.mjs";

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * @param {{ name: string, version: string, tags: string[] }[]} programs each
 *   program's current version and the versions its `program-<name>-*` tags name.
 * @returns {{ tags: string[], skipped: string[] }} `tags` to create, in
 *   alphabetical order. `skipped` names the programs with no earlier tag: the
 *   first tag and the first deploy of a program stay manual.
 */
export const tagsToCreate = (programs) => {
  const sorted = [...programs].sort(byName);
  return {
    tags: sorted
      .filter(({ version, tags }) => tags.length && !tags.includes(version))
      .map(({ name, version }) => `program-${name}-${version}`),
    skipped: sorted.filter(({ tags }) => !tags.length).map(({ name }) => name),
  };
};

const USAGE = "Usage: node scripts/program-auto-tag.mjs [head]";

// The tag list goes to stdout, one tag per line, for the workflow to read. The
// skip log goes to stderr so it never reads as a tag.
const main = (argv) => {
  if (argv.length > 1) throw new Error(USAGE);
  const { tags, skipped } = tagsToCreate(readPrograms(argv[0] ?? "HEAD", {}));
  for (const name of skipped) {
    process.stderr.write(`skipped ${name}: no program-${name}-* tag yet\n`);
  }
  for (const tag of tags) process.stdout.write(`${tag}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
