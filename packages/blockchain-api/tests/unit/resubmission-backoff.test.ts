import { expect } from "chai";
import { describe, it } from "mocha";
import { Op } from "sequelize";
import {
  resubmissionBackoffMs,
  resubmissionEligibilityWhere,
} from "../../src/lib/utils/resubmission-backoff";

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

describe("resubmissionEligibilityWhere", () => {
  const now = new Date("2026-08-21T00:00:00.000Z");

  it("excludes batches that reached maxRetries", () => {
    const where = resubmissionEligibilityWhere(10, now);
    expect(where.resubmissionCount).to.deep.equal({ [Op.lt]: 10 });
  });

  it("always allows a batch that was never resubmitted", () => {
    const [first] = resubmissionEligibilityWhere(10, now)[Op.or];
    expect(first).to.deep.equal({ lastResubmittedAt: null });
  });

  it("gives each backoff tier its own cutoff", () => {
    const clauses = resubmissionEligibilityWhere(10, now)[Op.or].slice(1);

    expect(clauses).to.deep.equal([
      {
        resubmissionCount: 1,
        lastResubmittedAt: { [Op.lte]: new Date(now.getTime() - 5000) },
      },
      {
        resubmissionCount: 2,
        lastResubmittedAt: { [Op.lte]: new Date(now.getTime() - 10000) },
      },
      {
        resubmissionCount: { [Op.gte]: 3 },
        lastResubmittedAt: { [Op.lte]: new Date(now.getTime() - 20000) },
      },
    ]);
  });

  it("selects nothing when retries are disabled", () => {
    const where = resubmissionEligibilityWhere(0, now);
    expect(where.resubmissionCount).to.deep.equal({ [Op.lt]: 0 });
  });
});
