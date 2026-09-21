import assert from "node:assert/strict";
import test from "node:test";

import {
  changelogSince,
  lastRelease,
  promotionPrBody,
} from "./promotion-pr-body.mjs";

const empty = {
  deploying: [],
  missingBump: [],
  unversioned: [],
  backMerge: null,
};

test("a program that will deploy carries its versions and its changelog text", () => {
  const body = promotionPrBody({
    ...empty,
    deploying: [
      {
        name: "data-credits",
        from: "0.2.7",
        to: "0.2.8",
        changelog: "### Patch Changes\n\n- Charge DC for the new instruction.",
      },
    ],
  });

  assert.match(body, /## Programs that will deploy/);
  assert.match(body, /\| data-credits \| 0\.2\.7 \| 0\.2\.8 \|/);
  assert.match(body, /### data-credits 0\.2\.7 → 0\.2\.8/);
  assert.match(body, /- Charge DC for the new instruction\./);
});

test("a program with changes and no bump is named with its files and its route", () => {
  const body = promotionPrBody({
    ...empty,
    missingBump: [
      {
        name: "hexboosting",
        version: "0.2.4",
        base: "abcdef0123456789",
        via: ["shared-utils"],
        files: ["utils/shared-utils/src/precise_number.rs"],
      },
    ],
  });

  assert.match(body, /## Programs with changes and no bump/);
  assert.match(
    body,
    /`hexboosting` 0\.2\.4 is tagged as `program-hexboosting-0\.2\.4`/,
  );
  assert.match(body, /utils\/shared-utils\/src\/precise_number\.rs/);
  assert.match(body, /through its dependency on shared-utils/);
});

test("an unversioned program changeset is listed with its levels and its text", () => {
  const body = promotionPrBody({
    ...empty,
    unversioned: [
      {
        file: ".changeset-programs/wide-pandas-shave.md",
        entries: [
          { name: "hpl-crons", level: "minor" },
          { name: "helium-sub-daos", level: "none" },
        ],
        text: "Adds the requeue instruction.",
      },
    ],
  });

  assert.match(body, /## Program changesets not yet versioned/);
  assert.match(body, /`\.changeset-programs\/wide-pandas-shave\.md`/);
  assert.match(body, /hpl-crons: minor, helium-sub-daos: none/);
  assert.match(body, /Adds the requeue instruction\./);
});

test("an open back-merge PR blocks the promotion and is linked", () => {
  const body = promotionPrBody({
    ...empty,
    backMerge: {
      url: "https://github.com/helium/helium-program-library/pull/9",
    },
  });

  assert.match(
    body,
    /Blocked: back-merge open.*https:\/\/github\.com\/helium\/helium-program-library\/pull\/9/s,
  );
});

test("no open back-merge PR leaves no block line", () => {
  assert.doesNotMatch(promotionPrBody(empty), /Blocked/);
});

test("the body always says promotion does nothing to npm packages or service images", () => {
  assert.match(
    promotionPrBody(empty),
    /Promotion does nothing to npm packages or service images\./,
  );
});

const CHANGELOG = `# data-credits

## 0.2.9

### Minor Changes

- Adds the burn instruction.

## 0.2.8

### Patch Changes

- Fixes the delegate PDA.

## 0.2.7

### Patch Changes

- The tagged release.
`;

test("the changelog text is every section above the last tagged version", () => {
  assert.equal(
    changelogSince(CHANGELOG, "0.2.7"),
    [
      "## 0.2.9",
      "",
      "### Minor Changes",
      "",
      "- Adds the burn instruction.",
      "",
      "## 0.2.8",
      "",
      "### Patch Changes",
      "",
      "- Fixes the delegate PDA.",
    ].join("\n"),
  );
});

test("a program with no earlier tag takes the whole changelog", () => {
  assert.match(changelogSince(CHANGELOG, null), /## 0\.2\.7/);
});

test("a missing changelog gives no text", () => {
  assert.equal(changelogSince(null, "0.2.7"), "");
});

test("the last release is the highest tag at or below the version on develop", () => {
  // helium-sub-daos carries a typo tag, program-helium-sub-daos-0.2.201.
  assert.equal(
    lastRelease(["0.2.49", "0.2.201", "0.2.50"], "0.2.51"),
    "0.2.50",
  );
});

test("a program whose only tags are above its version has no last release", () => {
  assert.equal(lastRelease(["0.2.3"], "0.2.2"), null);
});
