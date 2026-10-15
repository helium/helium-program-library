/**
 * Which programs changed between two refs.
 *
 * A program changed when the diff touches `programs/<name>/src/**` or
 * `programs/<name>/Cargo.toml`, or the same paths of a workspace crate it
 * depends on, directly or through other crates: a program links every crate
 * below it, so its binary changes too.
 *
 * A change to `Cargo.lock` marks each program whose resolved dependencies
 * differ between the base and head lockfiles, directly or through other
 * crates. A root `Cargo.toml` change marks every program when its
 * `[profile.*]` tables differ, which change every binary (`via` names
 * `Cargo.toml profile`). Any other root
 * `Cargo.toml` change moves a binary only through the resolution it writes to
 * `Cargo.lock`, so it marks nothing by itself.
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
 * Paths that never release. The one no-release judge: the backstop check
 * applies it, to npm packages too, and the changeset bot that part 2 adds later
 * will too, so a PR that changes nothing else gets no changeset and needs none.
 * As globs: every `.md` file, `tests/**`, every `.test.ts` file, `.github/**`,
 * and `.scratch/**`.
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

/**
 * The crate a changed file belongs to, or undefined when no crate claims it.
 * `<dir>/idls/` counts: `declare_program!` compiles those IDLs into the crate.
 */
export const crateFor = (crateDirs, file) => {
  for (const [dir, name] of crateDirs) {
    if (
      file === `${dir}/Cargo.toml` ||
      file.startsWith(`${dir}/src/`) ||
      file.startsWith(`${dir}/idls/`)
    ) {
      return name;
    }
  }
  return undefined;
};

/** The `[[package]]` entries of a `Cargo.lock`. */
export const parseLockfile = (text) =>
  text
    .split(/^\[\[package\]\]$/m)
    .slice(1)
    .map((block) => {
      const field = (key) =>
        block.match(new RegExp(`^${key} = "(.*)"$`, "m"))?.[1];
      const deps = block.match(/^dependencies = \[([^\]]*)\]/m)?.[1] ?? "";
      return {
        name: field("name"),
        version: field("version"),
        source: field("source"),
        checksum: field("checksum"),
        dependencies: [...deps.matchAll(/"([^"]*)"/g)].map(([, dep]) => dep),
      };
    });

/** Drops a `#` comment and every space outside a quoted string. */
const stripLine = (line) => {
  let out = "";
  let quote = null;
  for (const char of line) {
    if (quote) {
      out += char;
      if (char === quote) quote = null;
    } else if (char === "#") {
      break;
    } else if (char === '"' || char === "'") {
      quote = char;
      out += char;
    } else if (!/\s/.test(char)) {
      out += char;
    }
  }
  return out;
};

/**
 * The `[profile.*]` settings of a root `Cargo.toml`, as sorted
 * `table key=value` strings. Whitespace, comments and order do not count. Only
 * the one-line `key = value` form is read, which is all this repo's profile
 * tables use.
 */
export const profileSettings = (text) => {
  const settings = [];
  let table = null;
  for (const raw of text.split("\n")) {
    const line = stripLine(raw);
    if (line.startsWith("[")) {
      const name = line.replace(/^\[+|\]+$/g, "");
      table = name === "profile" || name.startsWith("profile.") ? name : null;
    } else if (table && line) {
      settings.push(`${table} ${line}`);
    }
  }
  return settings.sort();
};

/**
 * Program name -> every package it resolves, as `name version source
 * checksum` strings, or the bare name of a local crate. A workspace crate's
 * dev and build dependencies are not followed, as in `buildGraph`. A lockfile
 * does not record the kind of an edge, so the kind comes from `metadata`.
 * A registry or git package has no `metadata`, so the walk follows its build
 * dependencies too and can over-mark a program: that is accepted because it
 * fails safe, and the author declares `none` when the binary does not change.
 */
const resolvedDependencies = (metadata, programs, text) => {
  const packages = parseLockfile(text);
  const normalDeps = new Map(
    metadata.packages.map((pkg) => [
      pkg.name,
      new Set(
        pkg.dependencies.filter((dep) => !dep.kind).map((dep) => dep.name),
      ),
    ]),
  );
  // An entry is `name`, `name version` or `name version (source)`.
  const resolve = (entry) => {
    const [name, version, source] = entry.split(" ");
    return packages.find(
      (pkg) =>
        pkg.name === name &&
        (!version || pkg.version === version) &&
        (!source || `(${pkg.source})` === source),
    );
  };
  // A local crate's version is its own `Cargo.toml`, which the paths judge.
  const id = (pkg) =>
    pkg.source
      ? [pkg.name, pkg.version, pkg.source, pkg.checksum].join(" ")
      : pkg.name;

  const resolved = new Map();
  for (const program of programs) {
    const start = packages.find((pkg) => pkg.name === program && !pkg.source);
    const seen = new Set();
    const queue = start ? [start] : [];
    while (queue.length > 0) {
      const pkg = queue.shift();
      if (seen.has(id(pkg))) continue;
      seen.add(id(pkg));
      const member = !pkg.source && normalDeps.get(pkg.name);
      for (const entry of pkg.dependencies) {
        if (member && !member.has(entry.split(" ")[0])) continue;
        const dep = resolve(entry);
        if (dep) queue.push(dep);
      }
    }
    resolved.set(program, [...seen].sort().join("\n"));
  }
  return resolved;
};

/**
 * @param {{ metadata: object, files: string[], lockfiles?: { base: string, head: string }, manifests?: { base: string, head: string } }} input
 *   repo-relative paths, `cargo metadata --format-version 1 --no-deps` output,
 *   the `Cargo.lock` text at base and head, which a `Cargo.lock` change needs,
 *   and the root `Cargo.toml` text at base and head, which a root `Cargo.toml`
 *   change needs.
 * @returns {{ name: string, own: boolean, via: string[] }[]} one entry per
 *   changed program, sorted by name. `own: false` marks a dependent program.
 *   `via` names the changed crates it depends on, directly or not,
 *   `Cargo.lock` when its resolved dependencies changed, or
 *   `Cargo.toml profile` when a `[profile.*]` table changed.
 */
export const changedPrograms = ({ metadata, files, lockfiles, manifests }) => {
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
    const reached = new Set();
    const queue = [crate];
    while (queue.length > 0) {
      for (const dependent of dependents.get(queue.shift()) ?? []) {
        if (reached.has(dependent) || dependent === crate) continue;
        reached.add(dependent);
        queue.push(dependent);
      }
    }
    for (const dependent of reached) {
      if (!programs.has(dependent)) continue;
      const entry = entryFor(dependent);
      if (!entry.via.includes(crate)) entry.via.push(crate);
    }
  }

  if (files.includes("Cargo.toml")) {
    if (!manifests) {
      throw new Error(
        "a root Cargo.toml change needs the Cargo.toml at base and head",
      );
    }
    const base = profileSettings(manifests.base).join("\n");
    const head = profileSettings(manifests.head).join("\n");
    if (base !== head) {
      for (const program of programs) {
        entryFor(program).via.push("Cargo.toml profile");
      }
    }
  }

  if (files.includes("Cargo.lock")) {
    if (!lockfiles) {
      throw new Error(
        "a Cargo.lock change needs the Cargo.lock at base and head",
      );
    }
    const base = resolvedDependencies(metadata, programs, lockfiles.base);
    const head = resolvedDependencies(metadata, programs, lockfiles.head);
    for (const program of programs) {
      if (base.get(program) !== head.get(program)) {
        entryFor(program).via.push("Cargo.lock");
      }
    }
  }

  return [...changed.values()]
    .map((entry) => ({ ...entry, via: entry.via.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * The same answer when a program has its own base ref. The missing-bump check
 * asks per program, once from each program's tag and once from its recorded skip.
 *
 * @param {{ metadata: object, defaultBase: string, filesByBase: Record<string, string[]>, programBases?: Record<string, string>, lockfilesFor?: (base: string) => { base: string, head: string }, manifestsFor?: (base: string) => { base: string, head: string } }} input
 *   `lockfilesFor` is asked only for a base whose files include `Cargo.lock`,
 *   and `manifestsFor` only for a base whose files include `Cargo.toml`.
 */
export const changedProgramsForBases = ({
  metadata,
  defaultBase,
  filesByBase,
  programBases = {},
  lockfilesFor,
  manifestsFor,
}) => {
  const { programs } = buildGraph(metadata);
  const perBase = new Map();
  const changedFrom = (base) => {
    if (!perBase.has(base)) {
      const files = filesByBase[base] ?? [];
      perBase.set(
        base,
        changedPrograms({
          metadata,
          files,
          lockfiles: files.includes("Cargo.lock")
            ? lockfilesFor?.(base)
            : undefined,
          manifests: files.includes("Cargo.toml")
            ? manifestsFor?.(base)
            : undefined,
        }),
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

export const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

/** `file` at `ref`, or "" when the ref has none. */
const fileAt = (ref, file) => {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
};

/** `Cargo.lock` at `ref`, or "" when the ref has none. */
export const lockfileAt = (ref) => fileAt(ref, "Cargo.lock");

/** The root `Cargo.toml` at `ref`, or "" when the ref has none. */
export const manifestAt = (ref) => fileAt(ref, "Cargo.toml");

/** The paths that differ between `base` and `head`. */
export const changedFiles = (base, head) =>
  run("git", ["diff", "--name-only", "-z", "--no-renames", base, head])
    .split("\0")
    .filter(Boolean);

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
    filesByBase[ref] ??= changedFiles(ref, head);
  }
  const changed = changedProgramsForBases({
    metadata,
    defaultBase: base,
    filesByBase,
    programBases,
    lockfilesFor: (ref) => ({ base: lockfileAt(ref), head: lockfileAt(head) }),
    manifestsFor: (ref) => ({ base: manifestAt(ref), head: manifestAt(head) }),
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
