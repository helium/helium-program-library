import assert from "node:assert/strict";
import test from "node:test";

import { tagsToCreate } from "./program-auto-tag.mjs";

test("a version that has a tag gives no tag", () => {
  const { tags } = tagsToCreate([
    { name: "fanout", version: "0.1.3", tags: ["0.1.2", "0.1.3"] },
  ]);

  assert.deepEqual(tags, []);
});

test("a version with no tag gives its program release tag", () => {
  const { tags } = tagsToCreate([
    { name: "fanout", version: "0.1.3", tags: ["0.1.3"] },
    { name: "data-credits", version: "0.2.8", tags: ["0.2.6", "0.2.7"] },
  ]);

  assert.deepEqual(tags, ["program-data-credits-0.2.8"]);
});

test("a program with no earlier tag is skipped and named", () => {
  const { tags, skipped } = tagsToCreate([
    { name: "brand-new", version: "0.0.1", tags: [] },
    { name: "fanout", version: "0.1.4", tags: ["0.1.3"] },
  ]);

  assert.deepEqual(tags, ["program-fanout-0.1.4"]);
  assert.deepEqual(skipped, ["brand-new"]);
});

test("the tags come out in alphabetical order, whatever the input order", () => {
  const { tags, skipped } = tagsToCreate([
    { name: "voter-stake-registry", version: "0.4.10", tags: ["0.4.9"] },
    { name: "zeta-new", version: "0.0.1", tags: [] },
    { name: "helium-sub-daos", version: "0.2.51", tags: ["0.2.50"] },
    { name: "alpha-new", version: "0.0.1", tags: [] },
    { name: "data-credits", version: "0.2.8", tags: ["0.2.7"] },
  ]);

  assert.deepEqual(tags, [
    "program-data-credits-0.2.8",
    "program-helium-sub-daos-0.2.51",
    "program-voter-stake-registry-0.4.10",
  ]);
  assert.deepEqual(skipped, ["alpha-new", "zeta-new"]);
});
