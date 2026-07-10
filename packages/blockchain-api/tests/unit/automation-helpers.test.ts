import { expect } from "chai";
import { describe, it } from "mocha";
import { resolveScheduleToCron } from "../../src/lib/utils/automation-helpers";

describe("resolveScheduleToCron", () => {
  it("passes a raw crontab string through unchanged", () => {
    const raw = "0 30 14 * * 1";
    expect(resolveScheduleToCron(raw)).to.equal(raw);
  });

  it("resolves each preset to a 6-field crontab (not the preset literal)", () => {
    for (const preset of ["daily", "weekly", "monthly"]) {
      const cron = resolveScheduleToCron(preset);
      expect(cron).to.not.equal(preset);
      // sec min hour dom month dow
      expect(cron.split(" ")).to.have.lengthOf(6);
    }
  });

  it("maps daily to an every-day crontab (wildcard dom/month/dow)", () => {
    const [, , , dom, month, dow] = resolveScheduleToCron("daily").split(" ");
    expect([dom, month, dow]).to.deep.equal(["*", "*", "*"]);
  });
});
