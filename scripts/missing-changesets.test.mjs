import assert from "node:assert/strict";
import test from "node:test";

import { missingChangesets, parseChangeset } from "./missing-changesets.mjs";

const changed = {
  packages: ["@helium/idls", "@helium/spl-utils"],
  programs: [
    { name: "lazy-distributor", own: true, via: [] },
    { name: "welcome-pack", own: false, via: ["lazy-distributor"] },
  ],
  idls: { level: "minor", breaking: false },
};

const changeset = (text) => ({
  file: ".changeset/x.md",
  ...parseChangeset(text),
});
const programChangeset = (text) => ({
  file: ".changeset-programs/x.md",
  ...parseChangeset(text),
});

test("a hand-written changeset that names every changed package leaves nothing missing on the npm side", () => {
  const result = missingChangesets({
    ...changed,
    changesets: [
      changeset(
        '---\n"@helium/idls": minor\n"@helium/spl-utils": patch\n---\n\nAdd a thing.\n',
      ),
    ],
    programChangesets: [
      programChangeset(
        "---\nlazy-distributor: patch\nwelcome-pack: none\n---\n\nText.\n",
      ),
    ],
  });
  assert.deepEqual(result.npm, []);
  assert.deepEqual(result.programs, []);
  assert.equal(result.nothingMissing, true);
});

test("a changeset that names some packages leaves the rest missing, @helium/idls included", () => {
  const result = missingChangesets({
    ...changed,
    changesets: [changeset('---\n"@helium/spl-utils": patch\n---\n\nText.\n')],
    programChangesets: [],
  });
  assert.deepEqual(result.npm, ["@helium/idls"]);
  assert.deepEqual(result.idls, { level: "minor", breaking: false });
  assert.deepEqual(
    result.programs.map(({ name }) => name),
    ["lazy-distributor", "welcome-pack"],
  );
  assert.equal(result.nothingMissing, false);
});

test("@helium/idls is not wanted when the IDL diff names nothing", () => {
  const result = missingChangesets({
    ...changed,
    packages: ["@helium/spl-utils"],
    idls: null,
    changesets: [changeset('---\n"@helium/spl-utils": patch\n---\n\nText.\n')],
    programChangesets: [],
  });
  assert.deepEqual(result.npm, []);
  assert.equal(result.idls, null);
});

test("an empty changeset covers every npm package and no program", () => {
  const result = missingChangesets({
    ...changed,
    changesets: [changeset("---\n---\n\nOnly the build script changed.\n")],
    programChangesets: [],
  });
  assert.deepEqual(result.npm, []);
  assert.equal(result.programs.length, 2);
  assert.equal(result.nothingMissing, false);
});

test("a PR with nothing changed on either side has nothing missing", () => {
  const result = missingChangesets({
    packages: [],
    programs: [],
    idls: null,
    changesets: [],
    programChangesets: [],
  });
  assert.equal(result.nothingMissing, true);
});

test("parseChangeset reads quoted and bare names and rejects a file with no front matter", () => {
  const parsed = parseChangeset(
    '---\n"@helium/idls": minor\nlazy-distributor: none\n---\n\nText here.\n',
  );
  assert.deepEqual(
    { ...parsed, releases: { ...parsed.releases } },
    {
      releases: { "@helium/idls": "minor", "lazy-distributor": "none" },
      summary: "Text here.",
    },
  );
  const empty = parseChangeset("---\n---\n");
  assert.deepEqual(
    { ...empty, releases: { ...empty.releases } },
    { releases: {}, summary: "" },
  );
  assert.throws(() => parseChangeset("no front matter"), /no front matter/);
});

test("parseChangeset rejects __proto__ and reads constructor as a plain name", () => {
  assert.throws(
    () => parseChangeset("---\n__proto__: patch\n---\n"),
    /bad front matter line "__proto__: patch"/,
  );
  const { releases } = parseChangeset("---\nconstructor: patch\n---\n");
  assert.deepEqual(Object.keys(releases), ["constructor"]);
  assert.equal(Object.getPrototypeOf(releases), null);

  // An undeclared package stays missing next to a changeset that names only `constructor`.
  const result = missingChangesets({
    packages: ["@helium/spl-utils"],
    programs: [],
    idls: null,
    changesets: [{ releases }],
    programChangesets: [],
  });
  assert.deepEqual(result.npm, ["@helium/spl-utils"]);
  assert.equal(result.nothingMissing, false);
});

test("a missing own-source program carries the IDL diff's level hint; a dependent program carries none", () => {
  const result = missingChangesets({
    ...changed,
    programHints: { "lazy-distributor": "minor", "welcome-pack": "patch" },
    changesets: [],
    programChangesets: [],
  });
  assert.deepEqual(result.programs, [
    { name: "lazy-distributor", own: true, via: [], hint: "minor" },
    { name: "welcome-pack", own: false, via: ["lazy-distributor"] },
  ]);

  const noDiff = missingChangesets({
    ...changed,
    changesets: [],
    programChangesets: [],
  });
  assert.equal(noDiff.programs[0].hint, "patch");
});

test("parseChangeset rejects a release level it does not know", () => {
  assert.throws(
    () => parseChangeset("---\nlazy-distributor: pach\n---\n"),
    /bad release level "pach" for lazy-distributor/,
  );
});

test("parseChangeset reads a single-quoted name", () => {
  const parsed = parseChangeset("---\n'@helium/idls': minor\n---\n\nText.\n");
  assert.deepEqual({ ...parsed.releases }, { "@helium/idls": "minor" });
});

test("parseChangeset reads a file with CRLF line ends", () => {
  const parsed = parseChangeset(
    '---\r\n"@helium/idls": minor\r\nlazy-distributor: none\r\n---\r\n\r\nText here.\r\n',
  );
  assert.deepEqual(
    { ...parsed, releases: { ...parsed.releases } },
    {
      releases: { "@helium/idls": "minor", "lazy-distributor": "none" },
      summary: "Text here.",
    },
  );
});
