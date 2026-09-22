import assert from "node:assert/strict";
import test from "node:test";

import { changedPackages } from "./changed-packages.mjs";

// The two names really are crossed over in this repo, which is why the map
// reads each `package.json` instead of the directory name.
const manifests = [
  { dir: "packages/idls", packageJson: { name: "@helium/idls", version: "1" } },
  {
    dir: "packages/blockchain-api",
    packageJson: {
      name: "@helium/blockchain-api-service",
      version: "1",
      private: true,
    },
  },
  {
    dir: "packages/blockchain-api-client",
    packageJson: { name: "@helium/blockchain-api", version: "1" },
  },
  {
    dir: "packages/docsite",
    packageJson: { name: "hpl-docs", version: "1", private: true },
  },
  { dir: "packages/geocoder-service", packageJson: undefined },
];

const config = { ignore: [], privatePackages: { version: true } };

test("a changed file maps to the npm name in that directory's package.json", () => {
  assert.deepEqual(
    changedPackages({
      files: [
        "packages/blockchain-api/src/server.ts",
        "packages/blockchain-api-client/src/index.ts",
      ],
      manifests,
      config,
    }),
    ["@helium/blockchain-api", "@helium/blockchain-api-service"],
  );
});

test("a private package still releases while changesets versions private packages", () => {
  assert.deepEqual(
    changedPackages({
      files: ["packages/docsite/src/page.tsx"],
      manifests,
      config,
    }),
    ["hpl-docs"],
  );

  assert.deepEqual(
    changedPackages({
      files: ["packages/docsite/src/page.tsx"],
      manifests,
      config: { ignore: [], privatePackages: { version: false } },
    }),
    [],
  );
});

test("a directory with no package.json, and an ignored name, name nothing", () => {
  assert.deepEqual(
    changedPackages({
      files: ["packages/geocoder-service/src/index.ts"],
      manifests,
      config,
    }),
    [],
  );

  assert.deepEqual(
    changedPackages({
      files: ["packages/idls/tsconfig.json"],
      manifests,
      config: { ignore: ["@helium/idls"], privatePackages: { version: true } },
    }),
    [],
  );
});

test("docs and tests inside a package are no-release paths", () => {
  assert.deepEqual(
    changedPackages({
      files: [
        "packages/idls/README.md",
        "packages/idls/CHANGELOG.md",
        "packages/blockchain-api/tests/server.test.ts",
        "packages/blockchain-api/src/server.test.ts",
        "tests/helium-sub-daos.ts",
      ],
      manifests,
      config,
    }),
    [],
  );
});

test("a file outside packages/ names nothing", () => {
  assert.deepEqual(
    changedPackages({
      files: ["Cargo.lock", "programs/hexboosting/src/lib.rs", "package.json"],
      manifests,
      config,
    }),
    [],
  );
});
