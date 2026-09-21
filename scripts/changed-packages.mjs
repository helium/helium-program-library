/**
 * Which npm packages changed between two refs.
 *
 * The changeset bot and the backstop check need the same set changesets itself
 * would name, so the skip rule is changesets': a package named in
 * `.changeset/config.json` `ignore`, a private package when
 * `privatePackages.version` is off, and a `package.json` with no `version`
 * never release. The directory name is not the npm name (`packages/blockchain-api`
 * publishes `@helium/blockchain-api-service`), so every name is read from disk.
 *
 * On top of that, the no-release path filter from `changed-programs.mjs`
 * applies: a PR that only touches a package's docs or tests changes no package.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isNoReleasePath } from "./changed-programs.mjs";

const USAGE = "Usage: node scripts/changed-packages.mjs <base> [head]";

/** changesets' own rule, from `@changesets/should-skip-package`. */
const shouldSkip = ({ packageJson }, { ignore, privatePackages }) => {
  if (!packageJson) return true;
  // `ignore` takes micromatch globs; this repo's list is empty, so exact names
  // are enough and a glob would need a dependency.
  if (ignore.includes(packageJson.name)) return true;
  if (packageJson.private && !privatePackages.version) return true;
  return !packageJson.version;
};

/**
 * @param {{ files: string[], manifests: { dir: string, packageJson?: object }[], config: { ignore: string[], privatePackages: { version: boolean } } }} input
 *   repo-relative paths, one manifest per workspace package.
 * @returns {string[]} the npm names, sorted.
 */
export const changedPackages = ({ files, manifests, config }) => {
  // Longest directory first, so a nested package claims its own files.
  const byDepth = [...manifests].sort((a, b) => b.dir.length - a.dir.length);
  const changed = new Set();

  for (const file of files) {
    if (isNoReleasePath(file)) continue;
    const manifest = byDepth.find(({ dir }) => file.startsWith(`${dir}/`));
    if (!manifest || shouldSkip(manifest, config)) continue;
    changed.add(manifest.packageJson.name);
  }

  return [...changed].sort((a, b) => a.localeCompare(b));
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** One manifest per `packages/*` directory, the only workspace glob in use. */
const readManifests = () => {
  const dirs = readdirSync(path.join(repoRoot, "packages"), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory());
  return dirs.map((entry) => {
    const file = path.join(repoRoot, "packages", entry.name, "package.json");
    return {
      dir: `packages/${entry.name}`,
      packageJson: existsSync(file) ? readJson(file) : undefined,
    };
  });
};

/** The two `.changeset/config.json` fields the skip rule reads, defaults included. */
const readConfig = () => {
  const json = readJson(path.join(repoRoot, ".changeset", "config.json"));
  const privatePackages =
    json.privatePackages === false
      ? { version: false }
      : { version: json.privatePackages?.version ?? true };
  return { ignore: json.ignore ?? [], privatePackages };
};

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const main = (argv) => {
  const [base, head = "HEAD"] = argv;
  if (!base) throw new Error(USAGE);
  const files = run("git", ["diff", "--name-only", base, head])
    .split("\n")
    .filter(Boolean);
  const changed = changedPackages({
    files,
    manifests: readManifests(),
    config: readConfig(),
  });
  process.stdout.write(`${JSON.stringify(changed)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
