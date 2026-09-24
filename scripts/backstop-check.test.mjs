import assert from "node:assert/strict";
import test from "node:test";

import { backstopCheck } from "./backstop-check.mjs";
import { changedPackages } from "./changed-packages.mjs";
import { parseChangeset } from "./missing-changesets.mjs";

const changed = {
  packages: ["@helium/spl-utils"],
  programs: [
    { name: "lazy-distributor", own: true, via: [] },
    { name: "welcome-pack", own: false, via: ["lazy-distributor"] },
  ],
  idls: null,
  changesets: [],
  programChangesets: [],
};

const changeset = (text) => parseChangeset(text);

test("a changed package with no changeset fails, and the text names it", () => {
  const failure = backstopCheck({ ...changed, programs: [] });
  assert.match(failure, /@helium\/spl-utils/);
  assert.match(failure, /write a changeset by hand$/);
});

test("an empty changeset covers the packages but not the programs", () => {
  const failure = backstopCheck({
    ...changed,
    changesets: [changeset("---\n---\n\nOnly the build script changed.\n")],
  });
  assert.doesNotMatch(failure, /@helium\/spl-utils/);
  assert.match(failure, /lazy-distributor/);
  assert.match(failure, /welcome-pack/);

  assert.equal(
    backstopCheck({
      ...changed,
      programs: [],
      changesets: [changeset("---\n---\n\nOnly the build script changed.\n")],
    }),
    null,
  );
});

test("a program named with `none` is declared, so the check passes", () => {
  assert.equal(
    backstopCheck({
      ...changed,
      changesets: [
        changeset('---\n"@helium/spl-utils": patch\n---\n\nA thing.\n'),
      ],
      programChangesets: [
        changeset(
          "---\nlazy-distributor: patch\nwelcome-pack: none\n---\n\nOn chain.\n",
        ),
      ],
    }),
    null,
  );
});

test("a docs-only PR changes no package, so the check passes", () => {
  const packages = changedPackages({
    files: ["packages/spl-utils/README.md", "docs/architecture.md"],
    manifests: [
      {
        dir: "packages/spl-utils",
        packageJson: { name: "@helium/spl-utils", version: "1" },
      },
    ],
    config: { ignore: [], privatePackages: { version: true } },
  });
  assert.deepEqual(packages, []);
  assert.equal(backstopCheck({ ...changed, packages, programs: [] }), null);
});

test("an IDL change with no @helium/idls changeset fails", () => {
  const failure = backstopCheck({
    ...changed,
    programs: [],
    idls: { level: "minor", breaking: false },
    changesets: [
      changeset('---\n"@helium/spl-utils": patch\n---\n\nA thing.\n'),
    ],
  });
  assert.match(failure, /@helium\/idls/);
});
