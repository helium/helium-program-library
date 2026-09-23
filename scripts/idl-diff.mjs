/**
 * How one program's IDL differs between a base commit and a head commit.
 *
 * Both IDLs are flattened into a map of named entity -> shape, so a difference
 * is named ("type BurnArgsV0 field amount") instead of a JSON text diff. A
 * nested named collection becomes its own entities, so a struct that gains a
 * field reports the field, not the whole struct. A member's shape holds its
 * position, because Borsh layout and discriminants follow declaration order.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Entity kinds whose shape *is* a type. A difference here is a changed type. */
const TYPE_KINDS = new Set(["arg", "field", "type", "variant"]);

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const withoutKeys = (value, keys) =>
  Object.fromEntries(
    Object.entries(value ?? {}).filter(([key]) => !keys.includes(key)),
  );

/**
 * name -> { kind, shape, docs }. `shape` holds only what is not already an
 * entity of its own; `docs` is compared apart so a docs-only edit is not a
 * changed type.
 */
const entities = (idl) => {
  const found = new Map();
  const add = (kind, name, shape, docs) =>
    found.set(name, { kind, shape: canonical(shape), docs: canonical(docs) });

  // `metadata.version` tracks the crate version, not the interface: a version
  // bump alone must not read as an IDL difference.
  add("root", "address", idl.address);
  add("root", "metadata", withoutKeys(idl.metadata, ["version"]));

  for (const instruction of idl.instructions ?? []) {
    const at = `instruction ${instruction.name}`;
    add(
      "instruction",
      at,
      withoutKeys(instruction, ["name", "docs", "accounts", "args"]),
      instruction.docs,
    );
    for (const [index, account] of (instruction.accounts ?? []).entries()) {
      add(
        "instruction-account",
        `${at} account ${account.name}`,
        { index, ...withoutKeys(account, ["name", "docs"]) },
        account.docs,
      );
    }
    for (const [index, arg] of (instruction.args ?? []).entries()) {
      add("arg", `${at} arg ${arg.name}`, { index, type: arg.type }, arg.docs);
    }
  }

  for (const account of idl.accounts ?? []) {
    add(
      "account",
      `account ${account.name}`,
      withoutKeys(account, ["name", "docs"]),
      account.docs,
    );
  }

  for (const event of idl.events ?? []) {
    add(
      "event",
      `event ${event.name}`,
      withoutKeys(event, ["name", "docs"]),
      event.docs,
    );
  }

  for (const error of idl.errors ?? []) {
    add("error", `error ${error.code}`, withoutKeys(error, ["code"]));
  }

  for (const constant of idl.constants ?? []) {
    add(
      "constant",
      `constant ${constant.name}`,
      withoutKeys(constant, ["name", "docs"]),
      constant.docs,
    );
  }

  for (const type of idl.types ?? []) {
    const at = `type ${type.name}`;
    add(
      "type",
      at,
      withoutKeys(type.type, ["fields", "variants"]),
      type.docs ?? type.type?.docs,
    );
    for (const [index, field] of (type.type?.fields ?? []).entries()) {
      // A tuple struct's fields are bare types with no name.
      const name = field?.name ?? index;
      add(
        "field",
        `${at} field ${name}`,
        { index, type: field?.type ?? field },
        field?.docs,
      );
    }
    for (const [index, variant] of (type.type?.variants ?? []).entries()) {
      add(
        "variant",
        `${at} variant ${variant.name}`,
        { index, fields: variant.fields },
        variant.docs,
      );
    }
  }

  return found;
};

/**
 * @param {object | null} base the base IDL, or null when the program is new.
 * @param {object} head the head IDL.
 * @returns {{ added: {kind: string, name: string}[], removed: {kind: string, name: string}[], changed: {kind: string, name: string, from: string, to: string}[], other: {kind: string, name: string}[], hasChanges: boolean }}
 *   `changed` holds changed types; `other` holds every other difference (docs,
 *   account flags, discriminators).
 */
export const idlDiff = (base, head) => {
  const before = entities(base ?? {});
  const after = entities(head);

  const added = [];
  const removed = [];
  const changed = [];
  const other = [];

  for (const [name, entity] of after) {
    const was = before.get(name);
    if (!was) {
      added.push({ kind: entity.kind, name });
      continue;
    }
    if (was.shape === entity.shape && was.docs === entity.docs) continue;
    if (was.shape !== entity.shape && TYPE_KINDS.has(entity.kind)) {
      changed.push({
        kind: entity.kind,
        name,
        from: was.shape,
        to: entity.shape,
      });
      continue;
    }
    other.push({ kind: entity.kind, name });
  }

  for (const [name, entity] of before) {
    if (!after.has(name)) removed.push({ kind: entity.kind, name });
  }

  return {
    added,
    removed,
    changed,
    other,
    hasChanges:
      added.length + removed.length + changed.length + other.length > 0,
  };
};

/**
 * The `@helium/idls` bump for one program's diff. A fixed rule, no LLM: the
 * package publishes the generated types, so an addition widens the API and a
 * removal or a changed type can break a caller.
 *
 * @returns {{ level: "minor" | "patch", breaking: boolean } | null} null when
 *   the IDL did not change, so the package is not named at all.
 */
export const idlsLevel = (diff) => {
  if (!diff.hasChanges) return null;
  if (diff.removed.length > 0 || diff.changed.length > 0) {
    return { level: "minor", breaking: true };
  }
  if (diff.added.length > 0) return { level: "minor", breaking: false };
  return { level: "patch", breaking: false };
};

/**
 * The level hint for the program's own program changeset. A program version is
 * a deploy label with no semver consumers, so only a widened on-chain
 * interface earns a minor.
 *
 * @returns {"minor" | "patch"}
 */
export const programLevel = (diff) =>
  diff.added.some(({ kind }) => kind === "instruction" || kind === "account")
    ? "minor"
    : "patch";

/**
 * One `@helium/idls` bump covers every changed program, so the strongest level
 * across them wins and any breaking flag carries.
 *
 * @param {({ level: string, breaking: boolean } | null)[]} levels
 */
export const combinedIdlsLevel = (levels) => {
  const named = levels.filter((level) => level !== null);
  if (named.length === 0) return null;
  return {
    level: named.some(({ level }) => level === "minor") ? "minor" : "patch",
    breaking: named.some(({ breaking }) => breaking),
  };
};

/**
 * The whole answer the changeset bot and the backstop need: a level hint per
 * changed program, and the one `@helium/idls` level that covers them all.
 *
 * @param {{ programs: string[], readIdl: (program: string, side: "base" | "head") => object | null }} input
 *   `readIdl` returns null for a base that does not exist, which marks a new
 *   program.
 */
export const diffPrograms = ({ programs, readIdl }) => {
  const diffed = programs.map((name) => {
    const diff = idlDiff(readIdl(name, "base"), readIdl(name, "head"));
    return {
      name,
      level: programLevel(diff),
      changed: diff.hasChanges,
      idlsLevel: idlsLevel(diff),
      diff,
    };
  });

  return {
    idls: combinedIdlsLevel(diffed.map((entry) => entry.idlsLevel)),
    programs: diffed,
  };
};

const USAGE =
  "Usage: node scripts/idl-diff.mjs --base-dir <dir> --head-dir <dir> <program>...";

/**
 * `anchor idl build` names its output after the Cargo package with underscores,
 * while the changed-programs script names programs after their directory.
 */
const idlPath = (dir, program) =>
  path.join(dir, `${program.replaceAll("-", "_")}.json`);

const readIdlFile = (dir, program, side) => {
  const file = idlPath(dir, program);
  if (!existsSync(file)) {
    // A head IDL is always built, so only a base may be absent: a new program.
    if (side === "head") throw new Error(`No head IDL at ${file}`);
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8"));
};

const parseArgs = (argv) => {
  const dirs = {};
  const programs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const dir = { "--base-dir": "base", "--head-dir": "head" }[argv[i]];
    if (!dir) {
      programs.push(argv[i]);
      continue;
    }
    dirs[dir] = argv[i + 1];
    i += 1;
  }
  if (!dirs.base || !dirs.head || programs.length === 0) throw new Error(USAGE);
  return { dirs, programs };
};

const main = (argv) => {
  const { dirs, programs } = parseArgs(argv);
  const result = diffPrograms({
    programs,
    readIdl: (program, side) => readIdlFile(dirs[side], program, side),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
