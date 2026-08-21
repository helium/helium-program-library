import { expect } from "chai";
import { describe, it } from "mocha";
import { resubmissionBackoffMs } from "../../src/lib/utils/resubmission-backoff";

describe("resubmissionBackoffMs", () => {
  it("waits 5s after the first resubmission and doubles", () => {
    expect(resubmissionBackoffMs(1)).to.equal(5000);
    expect(resubmissionBackoffMs(2)).to.equal(10000);
    expect(resubmissionBackoffMs(3)).to.equal(20000);
  });

  it("caps at 20s", () => {
    expect(resubmissionBackoffMs(4)).to.equal(20000);
    expect(resubmissionBackoffMs(10)).to.equal(20000);
  });
});
