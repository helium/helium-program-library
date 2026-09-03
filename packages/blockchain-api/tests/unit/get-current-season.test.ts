import BN from "bn.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  getCurrentSeason,
  getCurrentSeasonEnd,
} from "../../src/server/api/routers/governance/procedures/helpers/get-current-season";

const season = (start: number, end: number) => ({
  start: new BN(start),
  end: new BN(end),
});

// Two back-to-back seasons, as mainnet's proxy config lays them out.
const seasons = [season(100, 200), season(200, 300)];

describe("getCurrentSeason", () => {
  it("returns the season whose window contains now", () => {
    expect(getCurrentSeasonEnd(seasons, new BN(150))!.toNumber()).to.eq(200);
    expect(getCurrentSeasonEnd(seasons, new BN(250))!.toNumber()).to.eq(300);
  });

  it("treats the start as inclusive and the end as exclusive, like the program", () => {
    // At 200 the first season has ended and the second has begun.
    expect(getCurrentSeasonEnd(seasons, new BN(200))!.toNumber()).to.eq(300);
    expect(getCurrentSeasonEnd(seasons, new BN(100))!.toNumber()).to.eq(200);
  });

  it("returns no season before the first starts", () => {
    expect(getCurrentSeason(seasons, new BN(99))).to.eq(undefined);
  });

  it("returns no season once the last has ended", () => {
    // The program unwraps this lookup, so a caller past the last end must be
    // refused rather than handed a bundle that panics in delegate_v0.
    expect(getCurrentSeason(seasons, new BN(300))).to.eq(undefined);
    expect(getCurrentSeasonEnd(seasons, new BN(10_000))).to.eq(undefined);
  });

  it("returns no season when there are none", () => {
    expect(getCurrentSeason([], new BN(150))).to.eq(undefined);
  });
});
