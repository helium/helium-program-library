import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  ED25519_SIGNATURE_BYTES,
  verifyEd25519,
} from "../../src/lib/utils/ed25519";

/** A Solana wallet and its signature over `MESSAGE`, produced by tweetnacl. */
const SIGNER = new PublicKey("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB");
const MESSAGE = Buffer.from("Approve invite 7 expiring 1800000000");
const SIGNATURE = Buffer.from(
  "h7qqS/IALDNvOQC3Acphs6HIUd8e5YHJWvdBLBUIbLSiAgpoWvBBA8MUzjuM5vFNzk7VZ8TQvkBaz4ETKshDDw==",
  "base64"
);

describe("verifyEd25519", () => {
  it("accepts a signature a Solana signer made over the message", () => {
    expect(verifyEd25519(MESSAGE, SIGNATURE, SIGNER.toBytes())).to.equal(true);
  });

  it("refuses the signature over any other message", () => {
    expect(
      verifyEd25519(
        Buffer.from("Approve invite 7 expiring 1800000001"),
        SIGNATURE,
        SIGNER.toBytes()
      )
    ).to.equal(false);
    expect(verifyEd25519(Buffer.alloc(0), SIGNATURE, SIGNER.toBytes())).to.equal(
      false
    );
  });

  it("refuses a signature with any bit flipped", () => {
    for (const index of [0, 31, 32, 63]) {
      const tampered = Buffer.from(SIGNATURE);
      tampered[index] ^= 1;
      expect(
        verifyEd25519(MESSAGE, tampered, SIGNER.toBytes()),
        `byte ${index}`
      ).to.equal(false);
    }
  });

  it("refuses a signature under any other key", () => {
    const other = new PublicKey("J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf");
    expect(verifyEd25519(MESSAGE, SIGNATURE, other.toBytes())).to.equal(false);
  });

  it("answers false for a wrong-length signature rather than throwing", () => {
    for (const length of [0, 32, 63, 65]) {
      expect(
        verifyEd25519(MESSAGE, Buffer.alloc(length), SIGNER.toBytes()),
        `length ${length}`
      ).to.equal(false);
    }
  });

  it("answers false for a wrong-length key rather than throwing", () => {
    for (const length of [0, 31, 33, 64]) {
      expect(
        verifyEd25519(MESSAGE, SIGNATURE, Buffer.alloc(length)),
        `length ${length}`
      ).to.equal(false);
    }
  });

  it("answers false for a key that is not a point on the curve", () => {
    // Every byte set is not a valid Ed25519 point encoding; the platform
    // verifier rejects the key itself, which has to surface as a refusal.
    expect(
      verifyEd25519(MESSAGE, SIGNATURE, Buffer.alloc(32, 0xff))
    ).to.equal(false);
  });

  it("states the signature size its callers check against", () => {
    expect(ED25519_SIGNATURE_BYTES).to.equal(64);
  });
});
