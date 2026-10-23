import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  missingBumpCheck,
  packageVersion,
  readPrograms,
  reviewedShas,
  showFile,
  taggedVersions,
} from "./missing-bump-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Real `cargo metadata --no-deps` output, trimmed to the fields the script reads.
const metadata = JSON.parse(
  readFileSync(path.join(here, "fixtures", "cargo-metadata.json"), "utf8"),
);

const find = (results, name) => results.find((r) => r.name === name);

test("a program whose current version has no tag is bumped, so it passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [
      { name: "price-oracle", version: "0.2.3", tags: ["0.2.2"] },
      {
        name: "fanout",
        version: "0.1.3",
        tags: ["0.1.3"],
        tagCommit: "fanout-tag",
      },
    ],
    changedFiles: () => ["programs/price-oracle/src/lib.rs"],
  });

  assert.equal(ok, true);
  assert.deepEqual(find(results, "price-oracle"), {
    name: "price-oracle",
    version: "0.2.3",
    status: "bumped",
    base: null,
    via: [],
    files: [],
  });
});

test("a tagged version with a source change fails and names the base and the files", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "price-oracle",
        version: "0.2.2",
        tags: ["0.2.2", "0.2.3"],
        tagCommit: "price-oracle-tag",
      },
    ],
    changedFiles: (base) =>
      base === "price-oracle-tag"
        ? ["programs/price-oracle/src/lib.rs", "tests/price-oracle.ts"]
        : [],
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "price-oracle",
      version: "0.2.2",
      status: "missing-bump",
      base: "price-oracle-tag",
      via: [],
      files: ["programs/price-oracle/src/lib.rs"],
    },
  ]);
});

test("a change only in a direct dependency fails the dependent", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "hexboosting",
        version: "0.2.4",
        tags: ["0.2.4"],
        tagCommit: "hexboosting-tag",
      },
    ],
    changedFiles: () => ["utils/shared-utils/src/precise_number.rs"],
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "hexboosting",
      version: "0.2.4",
      status: "missing-bump",
      base: "hexboosting-tag",
      via: ["shared-utils"],
      files: ["utils/shared-utils/src/precise_number.rs"],
    },
  ]);
});

const PRICE_ORACLE_SKIPPED = {
  name: "price-oracle",
  version: "0.2.2",
  tags: ["0.2.2"],
  tagCommit: "price-oracle-tag",
  reviewedSha: "reviewed-sha",
};

test("a change since the tag but not since the reviewed SHA passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: (base) =>
      base === "price-oracle-tag" ? ["programs/price-oracle/src/lib.rs"] : [],
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
});

test("a change since both the tag and the reviewed SHA fails", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: (base) =>
      ({
        "price-oracle-tag": [
          "programs/price-oracle/src/lib.rs",
          "programs/price-oracle/src/state.rs",
        ],
        "reviewed-sha": ["programs/price-oracle/src/state.rs"],
      })[base],
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "price-oracle",
      version: "0.2.2",
      status: "missing-bump",
      base: "price-oracle-tag",
      via: [],
      files: ["programs/price-oracle/src/state.rs"],
    },
  ]);
});

test("a change since the tag and a different change since the reviewed SHA passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: (base) =>
      ({
        "price-oracle-tag": ["programs/price-oracle/src/lib.rs"],
        "reviewed-sha": ["programs/price-oracle/src/state.rs"],
      })[base],
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
});

test("a change since the tag with no reviewed SHA fails on the tag diff alone", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [{ ...PRICE_ORACLE_SKIPPED, reviewedSha: undefined }],
    changedFiles: (base) =>
      base === "price-oracle-tag" ? ["programs/price-oracle/src/lib.rs"] : [],
  });

  assert.equal(ok, false);
  assert.equal(failing[0].status, "missing-bump");
  assert.deepEqual(failing[0].files, ["programs/price-oracle/src/lib.rs"]);
});

test("a program with no tag at all is skipped, and nothing is diffed for it", () => {
  const bases = [];
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [{ name: "welcome-pack", version: "0.0.6", tags: [] }],
    changedFiles: (base) => {
      bases.push(base);
      return ["programs/welcome-pack/src/lib.rs"];
    },
  });

  assert.deepEqual(bases, []);
  assert.equal(ok, true);
  assert.deepEqual(results, [
    {
      name: "welcome-pack",
      version: "0.0.6",
      status: "new",
      base: null,
      via: [],
      files: [],
    },
  ]);
});

test("a tests-only change since the tag passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "fanout",
        version: "0.1.3",
        tags: ["0.1.3"],
        tagCommit: "fanout-tag",
      },
    ],
    changedFiles: () => ["tests/fanout.ts", "programs/fanout/README.md"],
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
  assert.equal(results[0].base, "fanout-tag");
});

test("a failing program's files leave out its no-release files", () => {
  const { failing } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "fanout",
        version: "0.1.3",
        tags: ["0.1.3"],
        tagCommit: "fanout-tag",
      },
    ],
    changedFiles: () => [
      "programs/fanout/src/lib.rs",
      // Inside `src/`, so only the no-release rule keeps it out.
      "programs/fanout/src/NOTES.md",
    ],
  });

  assert.deepEqual(failing[0].files, ["programs/fanout/src/lib.rs"]);
});

test("showFile reads a missing path as null and throws on a bad ref", () => {
  assert.equal(showFile("HEAD", "no/such/file.toml"), null);
  assert.throws(() => showFile("no-such-ref-for-this-test", "Anchor.toml"));
});

test("showFile reads a path that is on disk but not in the tree as null", () => {
  // The empty tree. Cargo.lock is on disk, so git words the miss differently.
  assert.equal(
    showFile("4b825dc642cb6eb9a060e54bf8d69288fbee4904", "Cargo.lock"),
    null,
  );
});

test("only exact program-<name>-<x.y.z> tags of the program name its versions", () => {
  assert.deepEqual(
    taggedVersions("fanout", [
      "program-fanout-0.1.0",
      "vprogram-fanout-0.1.1",
      "v0.1.2",
      "program-fanout-0.1.3-test",
      "program-fanuot-0.1.4",
      "program-fanout-extra-0.1.5",
      "",
    ]),
    ["0.1.0"],
  );
});

test("the package version is the literal version, and a workspace-inherited one throws by name", () => {
  assert.equal(
    packageVersion("fanout", '[package]\nname = "fanout"\nversion = "0.1.3"\n'),
    "0.1.3",
  );
  assert.throws(
    () =>
      packageVersion(
        "fanout",
        '[package]\nname = "fanout"\nversion.workspace = true\n',
      ),
    /programs\/fanout\/Cargo.toml has no literal version/,
  );
});

test("a Cargo.lock change since the tag fails a program whose resolution moved", () => {
  const lock = (checksum) => `version = 4

[[package]]
name = "anchor-lang"
version = "0.31.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "${checksum}"

[[package]]
name = "price-oracle"
version = "0.2.2"
dependencies = [
 "anchor-lang",
]
`;
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "price-oracle",
        version: "0.2.2",
        tags: ["0.2.2"],
        tagCommit: "price-oracle-tag",
      },
    ],
    changedFiles: () => ["Cargo.lock"],
    lockfilesFor: () => ({ base: lock("aaaa"), head: lock("bbbb") }),
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "price-oracle",
      version: "0.2.2",
      status: "missing-bump",
      base: "price-oracle-tag",
      via: ["Cargo.lock"],
      files: ["Cargo.lock"],
    },
  ]);
});

test("a Cargo.lock change made before the reviewed SHA passes", () => {
  const lock = (checksum) => `version = 4

[[package]]
name = "anchor-lang"
version = "0.31.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "${checksum}"

[[package]]
name = "price-oracle"
version = "0.2.2"
dependencies = [
 "anchor-lang",
]
`;
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    // Cargo.lock changed since the reviewed SHA, but not for price-oracle.
    changedFiles: () => ["Cargo.lock"],
    lockfilesFor: (base) => ({
      base: lock(base === "price-oracle-tag" ? "aaaa" : "bbbb"),
      head: lock("bbbb"),
    }),
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
});

const profileManifest = (optLevel) =>
  `[workspace]\nmembers = ["programs/*"]\n\n[profile.release]\nopt-level = ${optLevel}\n`;

test("a root Cargo.toml profile change after the reviewed SHA fails a reviewed program", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: () => ["Cargo.toml"],
    manifestsFor: () => ({
      base: profileManifest(3),
      head: profileManifest(2),
    }),
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "price-oracle",
      version: "0.2.2",
      status: "missing-bump",
      base: "price-oracle-tag",
      via: ["Cargo.toml profile"],
      files: ["Cargo.toml"],
    },
  ]);
});

test("a root Cargo.toml profile change made before the reviewed SHA passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    // Cargo.toml changed since the reviewed SHA, but not in its profiles.
    changedFiles: () => ["Cargo.toml"],
    manifestsFor: (base) => ({
      base: profileManifest(base === "price-oracle-tag" ? 3 : 2),
      head: profileManifest(2),
    }),
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
});

test("reviewedShas keys each program to the newest commit that declared it none", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "missing-bump-check-"));
  const cwd = process.cwd();
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  const commit = (file, text) => {
    writeFileSync(path.join(repo, ".changeset-programs", file), text);
    git("add", ".");
    git("commit", "-q", "-m", file);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q");
    mkdirSync(path.join(repo, ".changeset-programs"));
    commit("README.md", "fanout: none\n");
    const fanout = commit(
      "a.md",
      "---\nfanout: none\nno-emit: patch\n---\n\nA.\n",
    );
    // `mini-fanout: none` contains `fanout: none`, and must not move fanout.
    const miniFanout = commit("b.md", "---\nmini-fanout: none\n---\n\nB.\n");
    // A text edit and a rewrite of the same declaration review nothing new.
    commit("a.md", "---\nfanout:  none\nno-emit: patch\n---\n\nA, reworded.\n");
    // Lowering a level to none is a new review.
    commit("a.md", "---\nfanout:  none\nno-emit: none\n---\n\nA.\n");
    // Raising it back retracts the older review.
    commit("a.md", "---\nfanout:  none\nno-emit: patch\n---\n\nA.\n");
    // The version step consumes changesets; the review stays in history.
    git("rm", "-q", ".changeset-programs/a.md", ".changeset-programs/b.md");
    git("commit", "-q", "-m", "consume");

    process.chdir(repo);
    assert.deepEqual(
      { ...reviewedShas("HEAD") },
      {
        fanout,
        "mini-fanout": miniFanout,
        "no-emit": null,
      },
    );
  } finally {
    process.chdir(cwd);
    rmSync(repo, { recursive: true, force: true });
  }
});

// Runs `body` in a new repo on `main`; the module's git calls use the cwd.
const inRepo = (body) => {
  const repo = mkdtempSync(path.join(tmpdir(), "missing-bump-check-"));
  const cwd = process.cwd();
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        ...args,
      ],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  const commit = (files) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      writeFileSync(path.join(repo, file), text);
    }
    git("add", ".");
    git("commit", "-q", "-m", Object.keys(files).join(" "));
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q", "-b", "main");
    process.chdir(repo);
    body({ repo, git, commit });
  } finally {
    process.chdir(cwd);
    rmSync(repo, { recursive: true, force: true });
  }
};

// Program x at 0.1.0, tagged, then a source change after the tag.
const taggedX = ({ git, commit }) => {
  commit({
    "programs/x/Cargo.toml": '[package]\nname = "x"\nversion = "0.1.0"\n',
    "programs/x/src/lib.rs": "// 1\n",
  });
  git("tag", "program-x-0.1.0");
  commit({ "programs/x/src/lib.rs": "// 2\n" });
};

const checkX = ({ repo, git }) => {
  const programs = readPrograms("HEAD", reviewedShas("HEAD"));
  const result = missingBumpCheck({
    metadata: {
      workspace_root: repo,
      packages: [
        {
          name: "x",
          manifest_path: path.join(repo, "programs/x/Cargo.toml"),
          dependencies: [],
        },
      ],
    },
    programs,
    changedFiles: (base) =>
      git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean),
  });
  return { programs, result };
};

test("readPrograms carries the reviewed SHA, which clears a change before it", () => {
  inRepo((repo) => {
    taggedX(repo);
    const reviewed = repo.commit({
      ".changeset-programs/a.md": "---\nx: none\n---\n\nA.\n",
    });

    const { programs, result } = checkX(repo);
    assert.equal(programs[0].reviewedSha, reviewed);
    assert.equal(result.results[0].status, "clean");
  });
});

test("raising a none back to a release level retracts the review", () => {
  inRepo((repo) => {
    taggedX(repo);
    repo.commit({ ".changeset-programs/a.md": "---\nx: none\n---\n\nA.\n" });
    repo.commit({ ".changeset-programs/a.md": "---\nx: patch\n---\n\nA.\n" });

    const { programs, result } = checkX(repo);
    assert.equal(programs[0].reviewedSha, null);
    assert.deepEqual(
      result.failing.map(({ name, files }) => [name, files]),
      [["x", ["programs/x/src/lib.rs"]]],
    );
  });
});

test("adding a release level in a new changeset keeps the none it does not remove", () => {
  inRepo((repo) => {
    taggedX(repo);
    const reviewed = repo.commit({
      ".changeset-programs/a.md": "---\nx: none\n---\n\nA.\n",
    });
    repo.commit({ ".changeset-programs/b.md": "---\nx: patch\n---\n\nB.\n" });

    assert.equal(reviewedShas("HEAD").x, reviewed);
  });
});

test("the newest of two none declarations is the reviewed SHA", () => {
  inRepo(({ commit }) => {
    commit({ ".changeset-programs/a.md": "---\nx: none\n---\n\nA.\n" });
    const newest = commit({
      ".changeset-programs/b.md": "---\nx: none\n---\n\nB.\n",
    });

    assert.equal(reviewedShas("HEAD").x, newest);
  });
});

test("a none removed and re-added on a merged branch does not move the review", () => {
  inRepo(({ git, commit }) => {
    const reviewed = commit({
      ".changeset-programs/a.md": "---\nx: none\n---\n\nA.\n",
      "programs/x/src/lib.rs": "// 1\n",
    });
    git("checkout", "-q", "-b", "pr");
    commit({ "programs/x/src/lib.rs": "// 2\n" });
    commit({ ".changeset-programs/a.md": "---\n---\n\nA.\n" });
    commit({ ".changeset-programs/a.md": "---\nx: none\n---\n\nA, again.\n" });
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "merge", "pr");

    // The branch's lib.rs change is after the reviewed SHA, so it still shows.
    assert.equal(reviewedShas("HEAD").x, reviewed);
  });
});

test("a none added on a merged branch reviews up to the merge commit", () => {
  inRepo(({ git, commit }) => {
    commit({ "programs/x/src/lib.rs": "// 1\n" });
    git("checkout", "-q", "-b", "pr");
    commit({ ".changeset-programs/a.md": "---\nx: none\n---\n\nA.\n" });
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "merge", "pr");

    assert.equal(reviewedShas("HEAD").x, git("rev-parse", "HEAD"));
  });
});
