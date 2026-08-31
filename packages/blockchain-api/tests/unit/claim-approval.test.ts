import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  checkApprovalWindow,
  claimApprovalMessage,
  MAX_CLAIM_APPROVAL_SECONDS,
  verifyClaimApproval,
} from "../../src/lib/utils/claim-approval";

const UNIQUE_ID = 7;
const EXPIRATION_TS = 1800000000;
const NOW = EXPIRATION_TS - 60;

/** The welcome pack's owner, the only key the program accepts an approval from. */
const OWNER = new PublicKey("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB");

/** A wallet that is not the pack's owner, whose signature must not be accepted. */
const OTHER = new PublicKey("J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf");

/**
 * `OWNER`'s Ed25519 signature over `Approve invite 7 expiring 1800000000`, in
 * the form the welcome-pack SDK's `claimApprovalSignature` produces and a
 * client sends. A fixed signature rather than one made during the test, so a
 * pass means this service reads what the signing side writes.
 */
const SIGNATURE =
  "h7qqS/IALDNvOQC3Acphs6HIUd8e5YHJWvdBLBUIbLSiAgpoWvBBA8MUzjuM5vFNzk7VZ8TQvkBaz4ETKshDDw==";

/** `OTHER`'s signature over the same message. Well formed, wrong signer. */
const SIGNATURE_BY_OTHER =
  "izvZY+3vc4EoavJ9ryybYEVW/KIb8ZxBjwbQjcSC5eYyALUW8S+lNCczg7RQda/CBPACEK3SABgw4DOmlLGNBA==";

function check(
  overrides: Partial<Parameters<typeof verifyClaimApproval>[0]> = {},
) {
  return verifyClaimApproval({
    uniqueId: UNIQUE_ID,
    expirationTs: EXPIRATION_TS,
    owner: OWNER.toBytes(),
    signatureBase64: SIGNATURE,
    now: NOW,
    ...overrides,
  });
}

describe("claimApprovalMessage", () => {
  it("spells the message the welcome-pack program rebuilds", () => {
    expect(claimApprovalMessage(UNIQUE_ID, EXPIRATION_TS)).to.equal(
      "Approve invite 7 expiring 1800000000",
    );
  });
});

describe("verifyClaimApproval", () => {
  it("accepts the pack owner's signature and returns the bytes it verified", () => {
    const result = check();
    expect(result.ok).to.equal(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.signature.toString("base64")).to.equal(SIGNATURE);
    expect(result.signature.length).to.equal(64);
  });

  it("refuses a signature by a wallet that is not the pack owner", () => {
    expect(check({ signatureBase64: SIGNATURE_BY_OTHER })).to.deep.equal({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("refuses the owner's signature checked against another key", () => {
    expect(check({ owner: OTHER.toBytes() })).to.deep.equal({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("refuses a signature over a different unique id", () => {
    expect(check({ uniqueId: UNIQUE_ID + 1 })).to.deep.equal({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("refuses a signature over a different expiry", () => {
    // Inside the window, so only the message it was signed over differs.
    expect(check({ expirationTs: EXPIRATION_TS - 1 })).to.deep.equal({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("refuses a tampered signature", () => {
    const tampered = Buffer.from(SIGNATURE, "base64");
    tampered[0] ^= 1;
    expect(
      check({ signatureBase64: tampered.toString("base64") }),
    ).to.deep.equal({ ok: false, reason: "invalid_signature" });
  });

  it("refuses a signature that is not 64 bytes, rather than throwing", () => {
    const short = Buffer.from(SIGNATURE, "base64").subarray(0, 32);
    expect(check({ signatureBase64: short.toString("base64") })).to.deep.equal({
      ok: false,
      reason: "malformed_signature",
    });
    expect(check({ signatureBase64: "" })).to.deep.equal({
      ok: false,
      reason: "malformed_signature",
    });
    expect(check({ signatureBase64: "not base64 at all!!" })).to.deep.equal({
      ok: false,
      reason: "malformed_signature",
    });
  });

  it("refuses an expiry that is not a number", () => {
    expect(check({ expirationTs: NaN })).to.deep.equal({
      ok: false,
      reason: "malformed_expiration",
    });
  });

  it("refuses an approval whose expiry has passed, and one expiring exactly now", () => {
    expect(check({ now: EXPIRATION_TS + 1 })).to.deep.equal({
      ok: false,
      reason: "expired",
    });
    // The program requires the expiry to be strictly ahead of the clock.
    expect(check({ now: EXPIRATION_TS })).to.deep.equal({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses an approval reaching further ahead than the program's window", () => {
    const now = EXPIRATION_TS - MAX_CLAIM_APPROVAL_SECONDS;
    // The whole window is still claimable.
    expect(check({ now }).ok).to.equal(true);
    expect(check({ now: now - 1 })).to.deep.equal({
      ok: false,
      reason: "window_too_long",
    });
  });

  it("bounds the window at the 30 days the program allows", () => {
    expect(MAX_CLAIM_APPROVAL_SECONDS).to.equal(30 * 24 * 60 * 60);
  });

  it("checks the window before it checks the signature", () => {
    // An approval outside the window is refused for the window, whatever the
    // signature says, so a caller cannot learn signature outcomes by sending
    // approvals the program would never accept.
    expect(
      check({ now: EXPIRATION_TS + 1, signatureBase64: "" }),
    ).to.deep.equal({ ok: false, reason: "expired" });
  });
});

describe("checkApprovalWindow", () => {
  it("passes an expiry inside the window", () => {
    expect(checkApprovalWindow({ expirationTs: EXPIRATION_TS, now: NOW })).to.be
      .null;
  });

  it("refuses an expiry that is not a number", () => {
    expect(checkApprovalWindow({ expirationTs: NaN, now: NOW })).to.equal(
      "malformed_expiration",
    );
  });

  it("refuses an expiry that has passed, and one expiring exactly now", () => {
    expect(
      checkApprovalWindow({
        expirationTs: EXPIRATION_TS,
        now: EXPIRATION_TS + 1,
      }),
    ).to.equal("expired");
    expect(
      checkApprovalWindow({ expirationTs: EXPIRATION_TS, now: EXPIRATION_TS }),
    ).to.equal("expired");
  });

  it("refuses an expiry reaching past the program's window, at one second over", () => {
    expect(
      checkApprovalWindow({
        expirationTs: NOW + MAX_CLAIM_APPROVAL_SECONDS + 1,
        now: NOW,
      }),
    ).to.equal("window_too_long");
    expect(
      checkApprovalWindow({
        expirationTs: NOW + MAX_CLAIM_APPROVAL_SECONDS,
        now: NOW,
      }),
      "the bound itself is allowed",
    ).to.be.null;
  });

  it("decides the same window rejections verifyClaimApproval reports", () => {
    // One rule, so an endpoint checking the window early cannot answer
    // differently from the full approval check that follows it.
    const cases = [
      { expirationTs: NaN, reason: "malformed_expiration" },
      { expirationTs: NOW - 1, reason: "expired" },
      {
        expirationTs: NOW + MAX_CLAIM_APPROVAL_SECONDS + 1,
        reason: "window_too_long",
      },
    ];
    for (const { expirationTs, reason } of cases) {
      expect(checkApprovalWindow({ expirationTs, now: NOW })).to.equal(reason);
      expect(check({ expirationTs, now: NOW })).to.deep.equal({
        ok: false,
        reason,
      });
    }
  });
});
