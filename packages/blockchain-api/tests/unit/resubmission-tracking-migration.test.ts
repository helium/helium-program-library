import { expect } from "chai";
import { describe, it } from "mocha";

const migration = require("../../src/lib/migrations/20260821000100-add-resubmission-tracking-to-transaction-batches.js");

describe("add-resubmission-tracking-to-transaction-batches down()", () => {
  it("surfaces a rollback failure instead of reporting success", async () => {
    // A swallowed failure lets umzug mark the migration reverted while the
    // columns are still there; the next up() then skips them via the
    // describeTable guard and the schema silently diverges.
    const queryInterface = {
      removeColumn: async () => {
        throw new Error("canceling statement due to lock timeout");
      },
    };

    let rejected = false;
    try {
      await migration.down(queryInterface);
    } catch (error) {
      rejected = true;
      expect((error as Error).message).to.contain("lock timeout");
    }

    expect(rejected).to.be.true;
  });
});
