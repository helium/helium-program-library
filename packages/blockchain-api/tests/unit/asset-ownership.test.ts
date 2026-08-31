import type { Asset } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  assertAssetOwner,
  assetOwnerAddress,
  fetchOwnedAsset,
} from "../../src/lib/utils/asset-ownership";

const OWNER = new PublicKey("GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172");
const INTRUDER = new PublicKey("ATGQKkmNat3N8ZXM2ChEKMNAQ45isPPfUpBrAnvX9J8R");

/** The one field of a cNFT an ownership check reads. */
const assetOwnedBy = (owner: PublicKey | string) =>
  ({ ownership: { owner } }) as unknown as Asset;

/** The error builder the endpoints pass in, tagged so a test can recognise it. */
class Unauthorized extends Error {}
class NotFound extends Error {}
const errors = {
  UNAUTHORIZED: ({ message }: { message: string }) => new Unauthorized(message),
};
const ownedErrors = {
  ...errors,
  NOT_FOUND: ({ message }: { message: string }) => new NotFound(message),
};

describe("assetOwnerAddress", () => {
  it("reads an owner the asset endpoint already decoded", () => {
    expect(assetOwnerAddress(assetOwnedBy(OWNER))).to.equal(OWNER.toBase58());
  });

  it("reads an owner the asset endpoint left as a string", () => {
    expect(assetOwnerAddress(assetOwnedBy(OWNER.toBase58()))).to.equal(
      OWNER.toBase58(),
    );
  });
});

describe("assertAssetOwner", () => {
  it("returns the owner it checked when the caller is that owner", () => {
    expect(
      assertAssetOwner({
        asset: assetOwnedBy(OWNER),
        expectedOwner: OWNER.toBase58(),
        message: "Wallet does not own this hotspot",
        errors,
      }),
    ).to.equal(OWNER.toBase58());
  });

  it("refuses a caller that is not the owner", () => {
    expect(() =>
      assertAssetOwner({
        asset: assetOwnedBy(OWNER),
        expectedOwner: INTRUDER.toBase58(),
        message: "Wallet does not own this hotspot",
        errors,
      }),
    ).to.throw(Unauthorized, "Wallet does not own this hotspot");
  });

  it("raises the endpoint's own wording", () => {
    expect(() =>
      assertAssetOwner({
        asset: assetOwnedBy(OWNER),
        expectedOwner: INTRUDER.toBase58(),
        message: "Multisig vault is not the owner of this hotspot",
        errors,
      }),
    ).to.throw(Unauthorized, "Multisig vault is not the owner of this hotspot");
  });

  it("compares the whole address, not a prefix of it", () => {
    expect(() =>
      assertAssetOwner({
        asset: assetOwnedBy(OWNER),
        expectedOwner: OWNER.toBase58().slice(0, -1),
        message: "Wallet does not own this hotspot",
        errors,
      }),
    ).to.throw(Unauthorized);
  });

  it("refuses a caller that is not the owner of a string-owned asset", () => {
    expect(() =>
      assertAssetOwner({
        asset: assetOwnedBy(OWNER.toBase58()),
        expectedOwner: INTRUDER.toBase58(),
        message: "Wallet does not own this hotspot",
        errors,
      }),
    ).to.throw(Unauthorized);
  });
});

describe("fetchOwnedAsset", () => {
  const found = (asset: Asset) => async (_url: string, _assetId: PublicKey) =>
    asset;
  const missing = async (_url: string, _assetId: PublicKey) => undefined;

  it("hands back the asset it fetched when the caller owns it", async () => {
    const asset = assetOwnedBy(OWNER);
    expect(
      await fetchOwnedAsset({
        assetEndpoint: "https://asset.endpoint",
        assetId: OWNER,
        expectedOwner: OWNER.toBase58(),
        message: "Wallet does not own this hotspot",
        errors: ownedErrors,
        getAssetFn: found(asset),
      }),
    ).to.equal(asset);
  });

  it("refuses an asset the endpoint does not know", async () => {
    try {
      await fetchOwnedAsset({
        assetEndpoint: "https://asset.endpoint",
        assetId: OWNER,
        expectedOwner: OWNER.toBase58(),
        message: "Wallet does not own this hotspot",
        errors: ownedErrors,
        getAssetFn: missing,
      });
      expect.fail("did not throw");
    } catch (e) {
      expect(e).to.be.instanceOf(NotFound);
    }
  });

  it("refuses a caller that is not the owner", async () => {
    try {
      await fetchOwnedAsset({
        assetEndpoint: "https://asset.endpoint",
        assetId: OWNER,
        expectedOwner: INTRUDER.toBase58(),
        message: "Wallet does not own this hotspot",
        errors: ownedErrors,
        getAssetFn: found(assetOwnedBy(OWNER)),
      });
      expect.fail("did not throw");
    } catch (e) {
      expect(e).to.be.instanceOf(Unauthorized);
    }
  });
});
