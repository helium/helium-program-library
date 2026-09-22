/**
 * Which programs changed between two refs.
 *
 * A program changed when the diff touches `programs/<name>/src/**` or
 * `programs/<name>/Cargo.toml`, or the same paths of a workspace crate it
 * depends on directly. Direct edges only. `Cargo.lock` and the root
 * `Cargo.toml` never mark a program.
 *
 * The dependency graph comes from `cargo metadata`: most programs write their
 * workspace deps as `workspace = true`, so `path =` lines in a program's own
 * `Cargo.toml` do not see them, while `cargo metadata` resolves each one to an
 * absolute path.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE =
  "Usage: node scripts/changed-programs.mjs <base> [head] [--base <program>=<ref>]...";

/**
 * Paths that never release. The one no-release judge: the changeset bot and
 * the backstop check both apply it, to npm packages too, so a PR that changes
 * nothing else gets no changeset and needs none. As globs: every `.md` file,
 * `tests/**`, every `.test.ts` file, `.github/**`, and `.scratch/**`.
 */
export const NO_RELEASE_PATTERNS = [
  /\.md$/,
  /(^|\/)tests\//,
  /\.test\.ts$/,
  /^\.github\//,
  /^\.scratch\//,
];

export const isNoReleasePath = (file) =>
  NO_RELEASE_PATTERNS.some((pattern) => pattern.test(file));

/** Repo-relative dir of a crate, given its absolute path and the workspace root. */
const relDir = (workspaceRoot, absPath) =>
  path.relative(workspaceRoot, absPath);

/**
 * Crate dir -> crate name, and crate name -> the programs that depend on it
 * directly.
 *
 * Built from the union of `packages[].manifest_path` and every
 * `dependencies[].path`: two path deps (`default-env`,
 * `pyth_solana_receiver_sdk`) are excluded from the workspace, so they never
 * appear in `packages[]` even though they are real source edges.
 */
export const buildGraph = (metadata) => {
  const root = metadata.workspace_root;
  const crateDirs = new Map();
  const dependents = new Map();
  const programs = new Set();

  const addCrate = (dir, name) => {
    crateDirs.set(dir, name);
    if (dir === `programs/${name}`) programs.add(name);
  };

  for (const pkg of metadata.packages) {
    addCrate(relDir(root, path.dirname(pkg.manifest_path)), pkg.name);
    for (const dep of pkg.dependencies) {
      if (!dep.path || dep.kind) continue;
      addCrate(relDir(root, dep.path), dep.name);
    }
  }

  for (const pkg of metadata.packages) {
    for (const dep of pkg.dependencies) {
      if (!dep.path || dep.kind) continue;
      if (!dependents.has(dep.name)) dependents.set(dep.name, new Set());
      dependents.get(dep.name).add(pkg.name);
    }
  }

  return { crateDirs, dependents, programs };
};

/** The crate a changed file belongs to, or undefined when no crate claims it. */
const crateFor = (crateDirs, file) => {
  for (const [dir, name] of crateDirs) {
    if (file === `${dir}/Cargo.toml` || file.startsWith(`${dir}/src/`)) {
      return name;
    }
  }
  return undefined;
};

/**
 * @param {{ metadata: object, files: string[] }} input repo-relative paths and
 *   `cargo metadata --format-version 1 --no-deps` output.
 * @returns {{ name: string, own: boolean, via: string[] }[]} one entry per
 *   changed program, sorted by name. `own: false` marks a dependent program.
 */
export const changedPrograms = ({ metadata, files }) => {
  const { crateDirs, dependents, programs } = buildGraph(metadata);
  const changed = new Map();

  const entryFor = (name) => {
    if (!changed.has(name)) changed.set(name, { name, own: false, via: [] });
    return changed.get(name);
  };

  for (const file of files) {
    if (isNoReleasePath(file)) continue;
    const crate = crateFor(crateDirs, file);
    if (!crate) continue;
    if (programs.has(crate)) entryFor(crate).own = true;
    for (const dependent of dependents.get(crate) ?? []) {
      if (!programs.has(dependent)) continue;
      const entry = entryFor(dependent);
      if (!entry.via.includes(crate)) entry.via.push(crate);
    }
  }

  return [...changed.values()]
    .map((entry) => ({ ...entry, via: entry.via.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * The same answer when a program has its own base ref. The missing-bump check
 * asks per program, from the later of that program's tag and its recorded skip.
 *
 * @param {{ metadata: object, defaultBase: string, filesByBase: Record<string, string[]>, programBases?: Record<string, string> }} input
 */
export const changedProgramsForBases = ({
  metadata,
  defaultBase,
  filesByBase,
  programBases = {},
}) => {
  const { programs } = buildGraph(metadata);
  const perBase = new Map();
  const changedFrom = (base) => {
    if (!perBase.has(base)) {
      perBase.set(
        base,
        changedPrograms({ metadata, files: filesByBase[base] ?? [] }),
      );
    }
    return perBase.get(base);
  };

  return [...programs]
    .sort((a, b) => a.localeCompare(b))
    .map((name) =>
      changedFrom(programBases[name] ?? defaultBase).find(
        (entry) => entry.name === name,
      ),
    )
    .filter((entry) => entry !== undefined);
};

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const diffFiles = (base, head) =>
  run("git", ["diff", "--name-only", base, head]).split("\n").filter(Boolean);

const parseArgs = (argv) => {
  const positional = [];
  const programBases = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--base") {
      positional.push(argv[i]);
      continue;
    }
    const [program, ref] = (argv[i + 1] ?? "").split("=");
    if (!program || !ref) throw new Error(USAGE);
    programBases[program] = ref;
    i += 1;
  }
  const [base, head = "HEAD"] = positional;
  if (!base) throw new Error(USAGE);
  return { base, head, programBases };
};

const main = (argv) => {
  const { base, head, programBases } = parseArgs(argv);
  const metadata = JSON.parse(
    run("cargo", ["metadata", "--format-version", "1", "--no-deps"]),
  );
  const filesByBase = {};
  for (const ref of [base, ...Object.values(programBases)]) {
    filesByBase[ref] ??= diffFiles(ref, head);
  }
  const changed = changedProgramsForBases({
    metadata,
    defaultBase: base,
    filesByBase,
    programBases,
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
