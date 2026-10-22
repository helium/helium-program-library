import { expect } from "chai";
import {
  ClaimDecision,
  EpochRewardsState,
  createClaimWindow,
} from "../src/utils/claimWindow";

const lastClaimedEpoch = 20_000;

const issued: EpochRewardsState = {
  subDaoEpochInfo: { rewardsIssued: true, hntRewardsIssued: true },
  daoEpochInfo: { doneIssuingRewards: true, delegationRewardsIssued: true },
};

// Decides epochs lastClaimedEpoch+1 .. lastClaimedEpoch+count in order.
const run = (
  count: number,
  stateAt: (epoch: number) => EpochRewardsState = () => issued,
) => {
  const window = createClaimWindow();
  const decisions = new Map<number, ClaimDecision>();
  for (let k = 1; k <= count; k++) {
    const epoch = lastClaimedEpoch + k;
    decisions.set(
      epoch,
      window.decide(epoch, () => stateAt(epoch)),
    );
  }
  const epochsWith = (decision: ClaimDecision) =>
    [...decisions].filter(([, d]) => d === decision).map(([e]) => e);
  return { window, epochsWith };
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_v, k) => from + k);

describe("createClaimWindow", () => {
  it("claims every epoch when every epoch is issued", () => {
    const { window, epochsWith } = run(200);
    expect(epochsWith("claim")).to.deep.equal(
      range(lastClaimedEpoch + 1, lastClaimedEpoch + 200),
    );
    expect(window.skipped).to.deep.equal([]);
    expect(window.dropped).to.deep.equal([]);
  });

  it("drops epochs past 128 above the epoch before an unissued one", () => {
    const unissued = lastClaimedEpoch + 5;
    const { window, epochsWith } = run(200, (epoch) =>
      epoch === unissued
        ? { subDaoEpochInfo: null, daoEpochInfo: null }
        : issued,
    );
    const windowEnd = lastClaimedEpoch + 4 + 128;
    expect(window.skipped).to.deep.equal([
      { epoch: unissued, reason: "unissued" },
    ]);
    expect(epochsWith("claim")).to.deep.equal([
      ...range(lastClaimedEpoch + 1, unissued - 1),
      ...range(unissued + 1, windowEnd),
    ]);
    expect(window.dropped).to.deep.equal(
      range(windowEnd + 1, lastClaimedEpoch + 200),
    );
  });

  it("skips an epoch with no delegation rewards and applies the same window", () => {
    const empty = lastClaimedEpoch + 5;
    const { window, epochsWith } = run(200, (epoch) =>
      epoch === empty
        ? {
            ...issued,
            daoEpochInfo: {
              doneIssuingRewards: true,
              delegationRewardsIssued: false,
            },
          }
        : issued,
    );
    const windowEnd = lastClaimedEpoch + 4 + 128;
    expect(window.skipped).to.deep.equal([
      { epoch: empty, reason: "no delegation rewards" },
    ]);
    expect(epochsWith("claim")).to.deep.equal([
      ...range(lastClaimedEpoch + 1, empty - 1),
      ...range(empty + 1, windowEnd),
    ]);
    expect(window.dropped).to.deep.equal(
      range(windowEnd + 1, lastClaimedEpoch + 200),
    );
  });

  const unissuedArms: [string, EpochRewardsState][] = [
    ["no sub-DAO epoch info", { subDaoEpochInfo: null, daoEpochInfo: null }],
    [
      "rewards_issued_at unset",
      {
        ...issued,
        subDaoEpochInfo: { rewardsIssued: false, hntRewardsIssued: true },
      },
    ],
    ["no DAO epoch info", { ...issued, daoEpochInfo: null }],
    [
      "DAO epoch not done issuing rewards",
      {
        ...issued,
        daoEpochInfo: {
          doneIssuingRewards: false,
          delegationRewardsIssued: true,
        },
      },
    ],
  ];
  for (const [arm, state] of unissuedArms) {
    it(`skips an epoch as unissued when ${arm}`, () => {
      const window = createClaimWindow();
      expect(window.decide(lastClaimedEpoch + 1, () => state)).to.equal(
        "skipped",
      );
      expect(window.skipped).to.deep.equal([
        { epoch: lastClaimedEpoch + 1, reason: "unissued" },
      ]);
    });
  }

  it("claims an epoch with no HNT rewards whatever the DAO epoch info holds", () => {
    const daoEpochInfos: EpochRewardsState["daoEpochInfo"][] = [
      null,
      { doneIssuingRewards: false, delegationRewardsIssued: false },
      { doneIssuingRewards: true, delegationRewardsIssued: false },
    ];
    for (const daoEpochInfo of daoEpochInfos) {
      const window = createClaimWindow();
      expect(
        window.decide(lastClaimedEpoch + 1, () => ({
          subDaoEpochInfo: { rewardsIssued: true, hntRewardsIssued: false },
          daoEpochInfo,
        })),
      ).to.equal("claim");
      expect(window.skipped).to.deep.equal([]);
    }
  });

  it("skips an epoch with no HNT rewards as unissued until rewards_issued_at is set", () => {
    const window = createClaimWindow();
    expect(
      window.decide(lastClaimedEpoch + 1, () => ({
        subDaoEpochInfo: { rewardsIssued: false, hntRewardsIssued: false },
        daoEpochInfo: null,
      })),
    ).to.equal("skipped");
  });
});
