import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    contracts: "src/contracts/index.ts",
    schemas: "src/schemas/index.ts",
    "schemas/common": "src/schemas/common.ts",
    "schemas/fiat": "src/schemas/fiat.ts",
    "schemas/governance": "src/schemas/governance.ts",
    "schemas/health": "src/schemas/health.ts",
    "schemas/hotspots": "src/schemas/hotspots.ts",
    "schemas/migration": "src/schemas/migration.ts",
    "schemas/reward-contract": "src/schemas/reward-contract.ts",
    "schemas/swap": "src/schemas/swap.ts",
    "schemas/tokens": "src/schemas/tokens.ts",
    "schemas/transactions": "src/schemas/transactions.ts",
    "schemas/data-credits": "src/schemas/data-credits.ts",
    "schemas/webhooks": "src/schemas/webhooks.ts",
    "schemas/welcome-packs": "src/schemas/welcome-packs.ts",
    errors: "src/errors/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: false,
  treeshake: true,
  splitting: true,
});
