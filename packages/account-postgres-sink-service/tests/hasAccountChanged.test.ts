import { expect } from "chai";
import { hasAccountChanged } from "../src/utils/hasAccountChanged";

// Shape of a row read back with `findAll({ raw: true })`: DECIMAL columns
// (i32/u32/i64/...) come back as strings.
const rawRow = {
  address: "hotspot1",
  asset: "asset1",
  elevation: "5",
  gain: "12",
  lastBlock: "100",
  refreshedAt: "2026-09-24T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// Shape of the same account after decode and sanitizeAccount: numbers stay numbers.
const decoded = {
  address: "hotspot1",
  asset: "asset1",
  elevation: 5,
  gain: 12,
  refreshedAt: "2026-09-25T00:00:00.000Z",
};

describe("hasAccountChanged", () => {
  it("treats a DECIMAL column read as a string as equal to the decoded number", () => {
    expect(hasAccountChanged(decoded, rawRow)).to.equal(false);
  });

  it("reports a change when a decoded value differs from the stored row", () => {
    expect(hasAccountChanged({ ...decoded, elevation: 6 }, rawRow)).to.equal(
      true,
    );
  });

  it("reports a change when no row exists yet", () => {
    expect(hasAccountChanged(decoded, undefined)).to.equal(true);
  });
});
