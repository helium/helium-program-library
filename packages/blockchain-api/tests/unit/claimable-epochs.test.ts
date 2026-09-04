import { EPOCH_LENGTH } from "@helium/helium-sub-daos-sdk";
import BN from "bn.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  getClaimableEpochRange,
  summarizeClaimableEpochs,
} from "../../src/server/api/routers/governance/procedures/helpers/claimable-epochs";

const CURRENT_EPOCH = 20500;
const epochStart = (epoch: number) => epoch * EPOCH_LENGTH;
// Mid-epoch so "now" is not on a boundary.
const UNIX_NOW = epochStart(CURRENT_EPOCH) + 5;

const CLIFF = { cliff: {} };
const CONSTANT = { constant: {} };

const range = ({
  lockupKind = CLIFF,
  lockupEndTs = epochStart(CURRENT_EPOCH + 365),
  lastClaimedEpoch,
  claimedEpochsBitmap = new BN(0),
  expirationTs = 0,
  unixNow = UNIX_NOW,
}: {
  lockupKind?: object;
  lockupEndTs?: number;
  lastClaimedEpoch: number;
  claimedEpochsBitmap?: BN;
  expirationTs?: number;
  unixNow?: number;
}) =>
  getClaimableEpochRange({
    lockup: { kind: lockupKind, endTs: new BN(lockupEndTs) },
    delegatedPosition: {
      lastClaimedEpoch: new BN(lastClaimedEpoch),
      claimedEpochsBitmap,
      expirationTs: new BN(expirationTs),
    },
    unixNow,
  });

/** Bitmap with the given epochs marked claimed, as set_claimed lays them out. */
const bitmapWith = (lastClaimedEpoch: number, claimed: number[]) =>
  claimed.reduce((bits, epoch) => {
    const bitIndex = epoch - lastClaimedEpoch - 1;
    return bits.or(new BN(1).shln(127 - bitIndex));
  }, new BN(0));

const allIssued = () => true;
const noneIssued = () => false;

describe("getClaimableEpochRange", () => {
  it("enumerates nothing for a fresh delegation", () => {
    // #given delegate_v0 sets last_claimed_epoch to the current epoch
    const r = range({ lastClaimedEpoch: CURRENT_EPOCH });

    // #then the current epoch is never claimable, so the range is empty
    expect(r.startEpoch).to.eq(CURRENT_EPOCH + 1);
    expect(r.endEpoch).to.eq(CURRENT_EPOCH);
    expect(r.unclaimedEpochs).to.deep.eq([]);
    expect(summarizeClaimableEpochs(r, allIssued)).to.deep.eq({
      claimableEpochCount: 0,
      unissuedRequiredEpochCount: 0,
    });
  });

  it("stops at the current epoch for a live delegation", () => {
    const r = range({ lastClaimedEpoch: CURRENT_EPOCH - 4 });

    expect(r.unclaimedEpochs).to.deep.eq([
      CURRENT_EPOCH - 3,
      CURRENT_EPOCH - 2,
      CURRENT_EPOCH - 1,
    ]);
    expect(r.closeRequiresThroughEpoch).to.eq(CURRENT_EPOCH - 1);
  });

  it("excludes epochs after an expired delegation's last paying epoch", () => {
    // #given expiration mid-epoch 20450: epoch 20450 still pays, later ones do not
    const expirationEpoch = CURRENT_EPOCH - 50;
    const r = range({
      lastClaimedEpoch: expirationEpoch - 2,
      expirationTs: epochStart(expirationEpoch) + 10,
    });

    // #then the range ends after the expiration epoch, not at the current epoch
    expect(r.rawEndEpoch).to.eq(expirationEpoch + 1);
    expect(r.unclaimedEpochs).to.deep.eq([expirationEpoch - 1, expirationEpoch]);
    expect(r.closeRequiresThroughEpoch).to.eq(expirationEpoch);
  });

  it("excludes the expiration epoch when expiration is on its boundary", () => {
    const expirationEpoch = CURRENT_EPOCH - 50;
    const r = range({
      lastClaimedEpoch: expirationEpoch - 2,
      expirationTs: epochStart(expirationEpoch),
    });

    expect(r.unclaimedEpochs).to.deep.eq([expirationEpoch - 1]);
    expect(r.closeRequiresThroughEpoch).to.eq(expirationEpoch - 1);
  });

  it("includes the lockup end epoch for a decayed cliff but does not require it for close", () => {
    // #given a cliff that ended mid-epoch 20470
    const endEpoch = CURRENT_EPOCH - 30;
    const r = range({
      lastClaimedEpoch: endEpoch - 2,
      lockupEndTs: epochStart(endEpoch) + 10,
    });

    // #then the epoch containing lockup end is claimable (full vehnt at its
    // start) while to_claim_to_epoch only requires the one before it
    expect(r.unclaimedEpochs).to.deep.eq([endEpoch - 1, endEpoch]);
    expect(r.closeRequiresThroughEpoch).to.eq(endEpoch - 1);
  });

  it("ignores lockup end for a constant lockup", () => {
    const r = range({
      lockupKind: CONSTANT,
      lockupEndTs: 0,
      lastClaimedEpoch: CURRENT_EPOCH - 3,
    });

    expect(r.unclaimedEpochs).to.deep.eq([CURRENT_EPOCH - 2, CURRENT_EPOCH - 1]);
  });

  it("skips epochs already set in the bitmap", () => {
    const lastClaimedEpoch = CURRENT_EPOCH - 6;
    const r = range({
      lastClaimedEpoch,
      claimedEpochsBitmap: bitmapWith(lastClaimedEpoch, [
        CURRENT_EPOCH - 4,
        CURRENT_EPOCH - 2,
      ]),
    });

    expect(r.unclaimedEpochs).to.deep.eq([
      CURRENT_EPOCH - 5,
      CURRENT_EPOCH - 3,
      CURRENT_EPOCH - 1,
    ]);
  });

  it("caps the range at the 128-epoch bitmap window", () => {
    const lastClaimedEpoch = CURRENT_EPOCH - 200;
    const r = range({ lastClaimedEpoch });

    expect(r.rawEndEpoch).to.eq(CURRENT_EPOCH);
    expect(r.bitmapWindowEnd).to.eq(lastClaimedEpoch + 129);
    expect(r.endEpoch).to.eq(lastClaimedEpoch + 129);
    expect(r.unclaimedEpochs).to.have.length(128);
    expect(r.unclaimedEpochs[127]).to.eq(lastClaimedEpoch + 128);
  });
});

describe("summarizeClaimableEpochs", () => {
  it("counts issued epochs as claimable and unissued required epochs separately", () => {
    // #given three unclaimed epochs, the newest not yet issued
    const r = range({ lastClaimedEpoch: CURRENT_EPOCH - 4 });

    const summary = summarizeClaimableEpochs(
      r,
      (epoch) => epoch < CURRENT_EPOCH - 1
    );

    // #then yesterday's epoch is required for close but not claimable yet
    expect(summary).to.deep.eq({
      claimableEpochCount: 2,
      unissuedRequiredEpochCount: 1,
    });
  });

  it("does not count an unissued epoch that close does not require", () => {
    // #given a decayed cliff whose lockup-end epoch is in range but not required
    const endEpoch = CURRENT_EPOCH - 30;
    const r = range({
      lastClaimedEpoch: endEpoch - 1,
      lockupEndTs: epochStart(endEpoch) + 10,
    });

    expect(r.unclaimedEpochs).to.deep.eq([endEpoch]);
    expect(summarizeClaimableEpochs(r, noneIssued)).to.deep.eq({
      claimableEpochCount: 0,
      unissuedRequiredEpochCount: 0,
    });
  });
});
