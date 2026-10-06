import { Connection, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  getDataOnlyIssueCostLamports,
  getDataOnlyIssueFunding,
  getDataOnlyOnboardRentLamports,
} from "../../src/lib/utils/balance-validation";

const stubConnection = (
  rentBySpace: (space: number) => number,
  requestedSpaces: number[] = [],
): Connection =>
  ({
    // Unique per stub so getRentLamports' module-level cache never crosses tests.
    rpcEndpoint: `stub://${Keypair.generate().publicKey.toBase58()}`,
    getMinimumBalanceForRentExemption: async (space: number) => {
      requestedSpaces.push(space);
      return rentBySpace(space);
    },
  }) as unknown as Connection;

describe("getDataOnlyIssueCostLamports", () => {
  it("prices the KeyToAssetV0 from the cluster and adds the stored tree fee", async () => {
    // issue_data_only_entity_v0 allocates
    // `8 + size_of::<KeyToAssetV0>() + 1 + entity_key.len()`; size_of is 96.
    const requestedSpaces: number[] = [];
    const connection = stubConnection(() => 1_234_567, requestedSpaces);

    const cost = await getDataOnlyIssueCostLamports(connection, {
      entityKeyLen: 38,
      newTreeFeeLamports: 69_215,
      // ceil(1_234_567 / 2^20) = 2, below the stored fee.
      newTreeSpace: 1000,
      newTreeDepth: 20,
    });

    expect(requestedSpaces).to.deep.equal([8 + 96 + 1 + 38, 1000]);
    expect(cost).to.equal(1_234_567 + 69_215);
  });

  it("quotes the rent-derived tree fee, rounded up, when it exceeds the stored fee", async () => {
    const connection = stubConnection(() => 1_234_567);

    const cost = await getDataOnlyIssueCostLamports(connection, {
      entityKeyLen: 38,
      newTreeFeeLamports: 69_215,
      // 1_234_567 / 2^3 = 154_320.875, above the stored fee.
      newTreeSpace: 1000,
      newTreeDepth: 3,
    });

    expect(cost).to.equal(1_234_567 + 154_321);
  });

  it("follows the cluster rent rather than a fixed figure", async () => {
    const low = await getDataOnlyIssueCostLamports(
      stubConnection((space) => space * 1000),
      {
        entityKeyLen: 38,
        newTreeFeeLamports: 0,
        newTreeSpace: 0,
        newTreeDepth: 0,
      },
    );
    const high = await getDataOnlyIssueCostLamports(
      stubConnection((space) => space * 6960),
      {
        entityKeyLen: 38,
        newTreeFeeLamports: 0,
        newTreeSpace: 0,
        newTreeDepth: 0,
      },
    );

    expect(low).to.equal(143 * 1000);
    expect(high).to.equal(143 * 6960);
  });
});

describe("getDataOnlyIssueFunding", () => {
  it("estimates the tx fee plus issue cost, and gates on that plus the wallet-rent floor", async () => {
    // 890_880 is the 0-byte rent floor; the KeyToAssetV0 (143 bytes) prices at 1_234_567.
    const connection = stubConnection((space) =>
      space === 0 ? 890_880 : 1_234_567,
    );

    const { estimatedLamports, requiredLamports } =
      await getDataOnlyIssueFunding(connection, {
        txFeeLamports: 10_000,
        entityKeyLen: 38,
        newTreeFeeLamports: 69_215,
        newTreeSpace: 1000,
        newTreeDepth: 20,
      });

    expect(estimatedLamports).to.equal(10_000 + 1_234_567 + 69_215);
    expect(requiredLamports - estimatedLamports).to.equal(890_880);
  });
});

describe("getDataOnlyOnboardRentLamports", () => {
  it("prices the IotHotspotInfoV0 the IoT onboard creates", async () => {
    const requestedSpaces: number[] = [];
    const connection = stubConnection((space) => space * 6960, requestedSpaces);

    const rent = await getDataOnlyOnboardRentLamports(connection, "iot");

    // IOT_HOTSPOT_INFO_SIZE in programs/helium-entity-manager/src/state.rs.
    expect(requestedSpaces).to.deep.equal([132]);
    expect(rent).to.equal(132 * 6960);
  });

  it("prices the MobileHotspotInfoV0 the mobile onboard creates", async () => {
    const requestedSpaces: number[] = [];
    const connection = stubConnection((space) => space * 6960, requestedSpaces);

    const rent = await getDataOnlyOnboardRentLamports(connection, "mobile");

    // MOBILE_HOTSPOT_INFO_SIZE in programs/helium-entity-manager/src/state.rs.
    expect(requestedSpaces).to.deep.equal([208]);
    expect(rent).to.equal(208 * 6960);
  });
});
