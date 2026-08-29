import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  iotInfoKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  DC_MINT,
  IOT_MINT,
  MOBILE_MINT,
} from "../../../spl-utils/src/constants";
import heliumEntityManagerIdl from "../../../spl-utils/src/idl/helium_entity_manager.json";
import { UpdateHotspotInfoInputSchema } from "../../../blockchain-api-client/src/schemas/hotspots";
import {
  assertDcCovered,
  assertNotDelegated,
  buildOwnerPaidUpdateInstruction,
  dcBurnerFor,
  hotspotInfoKey,
  locationAssertDcFee,
  locationStakingFee,
  resizeTopUpLamports,
  toOnChainElevation,
  toOnChainGain,
  withPreservedWifiSerial,
} from "../../src/server/api/routers/hotspots/procedures/update-info-owner";

const ENTITY_KEY = "1trSusfTpxRQ9QuLXFAtfsgKcJppYmMj6ZZKMRfmyQ8dABLuFXQ";
const OWNER = new PublicKey("GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172");
const MERKLE_TREE = new PublicKey(
  "8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF"
);

/**
 * The info PDAs derived straight from the SDK, so an assertion about the
 * instruction's info account cannot be satisfied by the same derivation the
 * builder used.
 */
const EXPECTED_MOBILE_INFO = mobileInfoKey(
  rewardableEntityConfigKey(subDaoKey(MOBILE_MINT)[0], "MOBILE")[0],
  ENTITY_KEY
)[0];
const EXPECTED_IOT_INFO = iotInfoKey(
  rewardableEntityConfigKey(subDaoKey(IOT_MINT)[0], "IOT")[0],
  ENTITY_KEY
)[0];

const PROOF_ARGS = {
  dataHash: new Array(32).fill(1),
  creatorHash: new Array(32).fill(2),
  root: new Array(32).fill(3),
  index: 7,
};

/**
 * The HEM program built against the checked-in IDL and an RPC endpoint that
 * refuses connections: every account the instruction needs is supplied by the
 * builder, so a passing test also proves the build takes no RPC round-trip.
 */
function hemProgram() {
  const connection = new Connection("http://127.0.0.1:1/no-rpc-in-unit-tests");
  const wallet = {
    publicKey: OWNER,
    signTransaction: async () => {
      throw new Error("unit test wallet cannot sign");
    },
    signAllTransactions: async () => {
      throw new Error("unit test wallet cannot sign");
    },
  };
  return new Program(
    heliumEntityManagerIdl as never,
    new AnchorProvider(
      connection,
      wallet as never,
      AnchorProvider.defaultOptions()
    )
    // The production program is built the same way, from the on-chain IDL.
  ) as unknown as Parameters<
    typeof buildOwnerPaidUpdateInstruction
  >[0]["program"];
}

/** Position of a named account in an instruction, read off the IDL itself. */
function accountIndex(instruction: string, account: string): number {
  const idlIx = (
    heliumEntityManagerIdl as unknown as {
      instructions: { name: string; accounts: { name: string }[] }[];
    }
  ).instructions.find((ix) => ix.name === instruction);
  if (!idlIx) throw new Error(`no ${instruction} in the IDL`);
  const index = idlIx.accounts.findIndex((a) => a.name === account);
  if (index < 0) throw new Error(`no ${account} on ${instruction}`);
  return index;
}

const validInput = (extra: Record<string, unknown> = {}) => ({
  deviceType: "iot" as const,
  entityPubKey: ENTITY_KEY,
  walletAddress: OWNER.toBase58(),
  ...extra,
});

describe("UpdateHotspotInfoInputSchema feePayer", () => {
  it("defaults to maker so existing callers keep the relayed behavior", () => {
    const parsed = UpdateHotspotInfoInputSchema.parse(validInput());
    expect(parsed.feePayer).to.eq("maker");
  });

  it("defaults to maker on the mobile branch too", () => {
    const parsed = UpdateHotspotInfoInputSchema.parse({
      deviceType: "mobile",
      entityPubKey: ENTITY_KEY,
      walletAddress: OWNER.toBase58(),
    });
    expect(parsed.feePayer).to.eq("maker");
  });

  it("accepts owner", () => {
    const parsed = UpdateHotspotInfoInputSchema.parse(
      validInput({ feePayer: "owner" })
    );
    expect(parsed.feePayer).to.eq("owner");
  });

  it("rejects a fee payer that is neither maker nor owner", () => {
    expect(
      UpdateHotspotInfoInputSchema.safeParse(validInput({ feePayer: "dao" }))
        .success
    ).to.eq(false);
  });
});

describe("buildOwnerPaidUpdateInstruction", () => {
  it("makes the owner the payer, DC fee payer and leaf owner (mobile)", async () => {
    const ix = await buildOwnerPaidUpdateInstruction({
      program: hemProgram(),
      owner: OWNER,
      entityKey: ENTITY_KEY,
      merkleTree: MERKLE_TREE,
      proofArgs: PROOF_ARGS,
      remainingAccounts: [],
      update: { network: "mobile", location: new BN(1234), deploymentInfo: null },
    });

    const at = (name: string) =>
      ix.keys[accountIndex("update_mobile_info_v0", name)];
    expect(at("payer").pubkey.toBase58()).to.eq(OWNER.toBase58());
    expect(at("dc_fee_payer").pubkey.toBase58()).to.eq(OWNER.toBase58());
    expect(at("hotspot_owner").pubkey.toBase58()).to.eq(OWNER.toBase58());
    expect(at("dc_burner").pubkey.toBase58()).to.eq(
      getAssociatedTokenAddressSync(DC_MINT, OWNER, true).toBase58()
    );
    // The burner is the owner's DC token account, not the owner itself.
    expect(at("dc_burner").pubkey.toBase58()).to.not.eq(OWNER.toBase58());
    expect(at("dc_mint").pubkey.toBase58()).to.eq(DC_MINT.toBase58());
    expect(at("merkle_tree").pubkey.toBase58()).to.eq(MERKLE_TREE.toBase58());
    expect(at("mobile_info").pubkey.toBase58()).to.eq(
      EXPECTED_MOBILE_INFO.toBase58()
    );
  });

  it("makes the owner the payer, DC fee payer and leaf owner (iot)", async () => {
    const ix = await buildOwnerPaidUpdateInstruction({
      program: hemProgram(),
      owner: OWNER,
      entityKey: ENTITY_KEY,
      merkleTree: MERKLE_TREE,
      proofArgs: PROOF_ARGS,
      remainingAccounts: [],
      update: {
        network: "iot",
        location: new BN(1234),
        elevation: 5,
        gain: 12,
      },
    });

    const at = (name: string) =>
      ix.keys[accountIndex("update_iot_info_v0", name)];
    expect(at("payer").pubkey.toBase58()).to.eq(OWNER.toBase58());
    expect(at("dc_fee_payer").pubkey.toBase58()).to.eq(OWNER.toBase58());
    expect(at("hotspot_owner").pubkey.toBase58()).to.eq(OWNER.toBase58());
    expect(at("dc_burner").pubkey.toBase58()).to.eq(
      dcBurnerFor(OWNER).toBase58()
    );
    expect(at("iot_info").pubkey.toBase58()).to.eq(
      EXPECTED_IOT_INFO.toBase58()
    );
  });

  it("appends the merkle proof after the instruction's own accounts", async () => {
    const proof = [
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    ].map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));

    const ix = await buildOwnerPaidUpdateInstruction({
      program: hemProgram(),
      owner: OWNER,
      entityKey: ENTITY_KEY,
      merkleTree: MERKLE_TREE,
      proofArgs: PROOF_ARGS,
      remainingAccounts: proof,
      update: { network: "mobile", location: null, deploymentInfo: null },
    });

    expect(ix.keys.slice(-2).map((k) => k.pubkey.toBase58())).to.deep.eq(
      proof.map((p) => p.pubkey.toBase58())
    );
  });

  it("appends the merkle proof on the iot branch too", async () => {
    const proof = [
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    ].map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));

    const ix = await buildOwnerPaidUpdateInstruction({
      program: hemProgram(),
      owner: OWNER,
      entityKey: ENTITY_KEY,
      merkleTree: MERKLE_TREE,
      proofArgs: PROOF_ARGS,
      remainingAccounts: proof,
      update: { network: "iot", location: null, elevation: null, gain: null },
    });

    expect(ix.keys.slice(-2).map((k) => k.pubkey.toBase58())).to.deep.eq(
      proof.map((p) => p.pubkey.toBase58())
    );
  });

  it("targets the helium entity manager program", async () => {
    const ix = await buildOwnerPaidUpdateInstruction({
      program: hemProgram(),
      owner: OWNER,
      entityKey: ENTITY_KEY,
      merkleTree: MERKLE_TREE,
      proofArgs: PROOF_ARGS,
      remainingAccounts: [],
      update: { network: "mobile", location: null, deploymentInfo: null },
    });
    expect(ix.programId.toBase58()).to.eq(
      "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8"
    );
  });
});

describe("hotspotInfoKey", () => {
  it("derives the iot_info PDA for an iot hotspot", () => {
    expect(hotspotInfoKey("iot", ENTITY_KEY).toBase58()).to.eq(
      EXPECTED_IOT_INFO.toBase58()
    );
  });

  it("derives the mobile_info PDA for a mobile hotspot", () => {
    expect(hotspotInfoKey("mobile", ENTITY_KEY).toBase58()).to.eq(
      EXPECTED_MOBILE_INFO.toBase58()
    );
  });
});

describe("assertNotDelegated", () => {
  const errors = {
    CONFLICT: (opts: { message: string }) => new Error(opts.message),
  };
  const owner = OWNER.toBase58();

  it("refuses a hotspot delegated to another authority", () => {
    const delegate = Keypair.generate().publicKey;
    expect(() => assertNotDelegated({ owner, delegate, errors })).to.throw(
      /delegated to another authority/
    );
  });

  it("refuses when the delegate arrives as a base58 string", () => {
    expect(() =>
      assertNotDelegated({
        owner,
        delegate: Keypair.generate().publicKey.toBase58(),
        errors,
      })
    ).to.throw(/delegated to another authority/);
  });

  it("allows an undelegated hotspot", () => {
    expect(() =>
      assertNotDelegated({ owner, delegate: null, errors })
    ).to.not.throw();
  });

  it("allows a leaf whose delegate is the owner itself", () => {
    expect(() =>
      assertNotDelegated({ owner, delegate: OWNER, errors })
    ).to.not.throw();
  });
});

describe("assertDcCovered", () => {
  const errors = {
    INSUFFICIENT_FUNDS: (opts: {
      message: string;
      data: { required: number; available: number };
    }) => Object.assign(new Error(opts.message), { data: opts.data }),
  };

  it("refuses when the owner holds less DC than the burn needs", () => {
    expect(() =>
      assertDcCovered({
        required: new BN(1000),
        available: BigInt(999),
        errors,
      })
    ).to.throw(/Insufficient DC balance/);
  });

  it("allows an exact balance", () => {
    expect(() =>
      assertDcCovered({
        required: new BN(1000),
        available: BigInt(1000),
        errors,
      })
    ).to.not.throw();
  });

  it("reports the shortfall in its data", () => {
    try {
      assertDcCovered({ required: new BN(7), available: BigInt(2), errors });
      expect.fail("expected a refusal");
    } catch (e) {
      expect((e as { data: unknown }).data).to.deep.eq({
        required: 7,
        available: 2,
      });
    }
  });
});

describe("locationAssertDcFee", () => {
  const fee = new BN(500000);

  it("charges the staking fee for a first location assert", () => {
    expect(
      locationAssertDcFee({
        newLocation: new BN(10),
        currentLocation: null,
        stakingFee: fee,
      }).toString()
    ).to.eq("500000");
  });

  it("charges nothing when the asserted location is already stored", () => {
    expect(
      locationAssertDcFee({
        newLocation: new BN(10),
        currentLocation: new BN(10),
        stakingFee: fee,
      }).isZero()
    ).to.eq(true);
  });

  it("charges the fee when the location moves", () => {
    expect(
      locationAssertDcFee({
        newLocation: new BN(11),
        currentLocation: new BN(10),
        stakingFee: fee,
      }).toString()
    ).to.eq("500000");
  });

  it("charges nothing when no location is asserted", () => {
    expect(
      locationAssertDcFee({
        newLocation: null,
        currentLocation: new BN(10),
        stakingFee: fee,
      }).isZero()
    ).to.eq(true);
  });

  it("charges nothing when the settings carry no fee", () => {
    expect(
      locationAssertDcFee({
        newLocation: new BN(10),
        currentLocation: null,
        stakingFee: null,
      }).isZero()
    ).to.eq(true);
  });
});

describe("locationStakingFee", () => {
  it("uses the full-hotspot fee for a full IoT hotspot", () => {
    const fee = locationStakingFee(
      {
        iotConfig: {
          fullLocationStakingFee: new BN(100),
          dataonlyLocationStakingFee: new BN(10),
        },
      },
      { network: "iot", isFullHotspot: true }
    );
    expect(fee?.toString()).to.eq("100");
  });

  it("uses the data-only fee for a data-only IoT hotspot", () => {
    const fee = locationStakingFee(
      {
        iotConfig: {
          fullLocationStakingFee: new BN(100),
          dataonlyLocationStakingFee: new BN(10),
        },
      },
      { network: "iot", isFullHotspot: false }
    );
    expect(fee?.toString()).to.eq("10");
  });

  it("picks the mobile fee matching the hotspot's device type", () => {
    const fee = locationStakingFee(
      {
        mobileConfigV2: {
          feesByDevice: [
            { deviceType: { cbrs: {} }, locationStakingFee: new BN(1) },
            { deviceType: { wifiIndoor: {} }, locationStakingFee: new BN(2) },
          ],
        },
      },
      { network: "mobile", deviceType: { wifiIndoor: {} } }
    );
    expect(fee?.toString()).to.eq("2");
  });

  it("falls back to the v1 fee table", () => {
    const fee = locationStakingFee(
      {
        mobileConfigV1: {
          feesByDevice: [
            { deviceType: { wifiOutdoor: {} }, locationStakingFee: new BN(9) },
          ],
        },
      },
      { network: "mobile", deviceType: { wifiOutdoor: {} } }
    );
    expect(fee?.toString()).to.eq("9");
  });

  it("returns null when the device type has no entry", () => {
    expect(
      locationStakingFee(
        {
          mobileConfigV2: {
            feesByDevice: [
              { deviceType: { cbrs: {} }, locationStakingFee: new BN(1) },
            ],
          },
        },
        { network: "mobile", deviceType: { wifiDataOnly: {} } }
      )
    ).to.eq(null);
  });

  it("returns null when the hotspot's device type is unreadable", () => {
    expect(
      locationStakingFee(
        {
          mobileConfigV2: {
            feesByDevice: [
              { deviceType: {}, locationStakingFee: new BN(1) },
            ],
          },
        },
        { network: "mobile", deviceType: {} }
      )
    ).to.eq(null);
  });

  it("returns null for an IoT hotspot on mobile settings", () => {
    expect(
      locationStakingFee(
        { mobileConfig: { fullLocationStakingFee: new BN(5) } },
        { network: "iot", isFullHotspot: true }
      )
    ).to.eq(null);
  });
});

describe("resizeTopUpLamports", () => {
  it("charges the difference when the account is short of rent", () => {
    expect(resizeTopUpLamports(2_000_000, 1_500_000)).to.eq(500_000);
  });

  it("charges nothing when the account is already funded", () => {
    expect(resizeTopUpLamports(2_000_000, 2_000_000)).to.eq(0);
  });

  it("charges nothing when the account shrinks below its balance", () => {
    expect(resizeTopUpLamports(1_000_000, 2_000_000)).to.eq(0);
  });
});

describe("withPreservedWifiSerial", () => {
  const existing = { wifiInfoV0: { serial: "SERIAL-123" } };

  it("carries the stored serial into an update that omits it", () => {
    expect(
      withPreservedWifiSerial({ wifiInfoV0: { serial: null } }, existing)
        .wifiInfoV0?.serial
    ).to.eq("SERIAL-123");
  });

  it("carries the stored serial into an update that sends an empty one", () => {
    expect(
      withPreservedWifiSerial({ wifiInfoV0: { serial: "" } }, existing)
        .wifiInfoV0?.serial
    ).to.eq("SERIAL-123");
  });

  it("keeps a serial the update does supply", () => {
    expect(
      withPreservedWifiSerial({ wifiInfoV0: { serial: "NEW-456" } }, existing)
        .wifiInfoV0?.serial
    ).to.eq("NEW-456");
  });

  it("leaves the serial unset when nothing is stored", () => {
    expect(
      withPreservedWifiSerial({ wifiInfoV0: { serial: null } }, undefined)
        .wifiInfoV0?.serial
    ).to.eq(null);
  });

  it("passes a non-wifi deployment info through untouched", () => {
    const cbrs = { cbrsInfoV0: { radioInfos: [] } };
    expect(withPreservedWifiSerial(cbrs, existing)).to.deep.eq(cbrs);
  });
});

describe("on-chain unit conversion", () => {
  it("stores gain as tenths of a dBi", () => {
    expect(toOnChainGain(1.2)).to.eq(12);
  });

  it("truncates rather than rounds a fractional gain", () => {
    expect(toOnChainGain(1.29)).to.eq(12);
  });

  it("leaves an unset gain unset", () => {
    expect(toOnChainGain(undefined)).to.eq(null);
  });

  it("stores elevation as whole meters", () => {
    expect(toOnChainElevation(12.7)).to.eq(12);
  });

  it("leaves an unset elevation unset", () => {
    expect(toOnChainElevation(undefined)).to.eq(null);
  });
});
