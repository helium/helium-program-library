import { BorshAccountsCoder, BN, Idl } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { before, describe, it } from "mocha";
import {
  IOT_HOTSPOT_INFO_SPACE,
  keyToAssetSpace,
  MOBILE_HOTSPOT_INFO_SPACE,
} from "../../../helium-entity-manager-sdk/src/constants";

// The size literals in helium-entity-manager-sdk mirror
// programs/helium-entity-manager/src/state.rs. These tests derive each size
// from the IDL anchor build writes, not the committed spl-utils copy, so a
// state.rs struct change fails here even when the committed IDL is not
// regenerated.

const BUILT_IDL = resolve(
  __dirname,
  "../../../../target/idl/helium_entity_manager.json",
);
let idl: Idl;
let coder: BorshAccountsCoder;

// Rules state.rs applies on top of the borsh layout; the IDL does not carry them.
const PAD = 60;
const MAX_SERIAL_LEN = 64;

const idlType = (name: string) => {
  const t = idl.types?.find((ty) => ty.name === name);
  if (!t) throw new Error(`${name} missing from the IDL`);
  return t.type;
};

/**
 * `std::mem::size_of` for a struct of the field types KeyToAssetV0 uses. Rust
 * reorders fields, so the size is the field sum rounded up to the widest
 * alignment. Throws on a type it does not know, so a new field kind fails
 * the test rather than being mis-sized.
 */
const rustSizeOf = (name: string): number => {
  const t = idlType(name);
  if (t.kind !== "struct" || !Array.isArray(t.fields)) {
    throw new Error(`${name} is not a struct with named fields`);
  }
  let size = 0;
  let align = 1;
  for (const field of t.fields as { name: string; type: unknown }[]) {
    const [fieldSize, fieldAlign] = rustLayout(field.type);
    size += fieldSize;
    align = Math.max(align, fieldAlign);
  }
  return Math.ceil(size / align) * align;
};

const rustLayout = (type: unknown): [number, number] => {
  if (type === "pubkey") return [32, 1];
  if (type === "u8" || type === "bool") return [1, 1];
  // Vec<u8>: pointer, capacity, length.
  if (type === "bytes") return [24, 8];
  const defined = (type as { defined?: { name: string } }).defined?.name;
  if (defined) {
    const t = idlType(defined);
    if (t.kind === "enum" && t.variants.every((v) => !v.fields)) {
      return [1, 1];
    }
  }
  throw new Error(`no Rust layout for ${JSON.stringify(type)}`);
};

const key = PublicKey.default;

describe("helium-entity-manager-sdk account sizes match the IDL", () => {
  // Loaded here, not at import, so a missing build fails only this suite.
  before(() => {
    if (!existsSync(BUILT_IDL)) {
      throw new Error(
        `${BUILT_IDL} is missing. Run \`anchor build -p helium_entity_manager\` at the repo root first.`,
      );
    }
    idl = JSON.parse(readFileSync(BUILT_IDL, "utf8")) as Idl;
    coder = new BorshAccountsCoder(idl);
  });

  it("keyToAssetSpace carries size_of::<KeyToAssetV0>()", () => {
    // issue_data_only_entity_v0: 8 + size_of::<KeyToAssetV0>() + 1 + entity_key.len()
    expect(keyToAssetSpace(0) - 8 - 1).to.equal(rustSizeOf("KeyToAssetV0"));
  });

  it("IOT_HOTSPOT_INFO_SPACE is a full IotHotspotInfoV0 plus the pad", async () => {
    const encoded = await coder.encode("IotHotspotInfoV0", {
      asset: key,
      bump_seed: 0,
      location: new BN(0),
      elevation: 0,
      gain: 0,
      is_full_hotspot: false,
      num_location_asserts: 0,
      is_active: false,
      dc_onboarding_fee_paid: new BN(0),
    });
    expect(IOT_HOTSPOT_INFO_SPACE).to.equal(encoded.length + PAD);
  });

  it("MOBILE_HOTSPOT_INFO_SPACE is a full WiFi MobileHotspotInfoV0 plus the pad", async () => {
    // WifiInfoV0 is the larger variant state.rs sizes for, with the serial at
    // its maximum length.
    const encoded = await coder.encode("MobileHotspotInfoV0", {
      asset: key,
      bump_seed: 0,
      location: new BN(0),
      is_full_hotspot: false,
      num_location_asserts: 0,
      is_active: false,
      dc_onboarding_fee_paid: new BN(0),
      device_type: { WifiIndoor: {} },
      deployment_info: {
        WifiInfoV0: {
          antenna: 0,
          elevation: 0,
          azimuth: 0,
          mechanical_down_tilt: 0,
          electrical_down_tilt: 0,
          serial: "s".repeat(MAX_SERIAL_LEN),
        },
      },
    });
    expect(MOBILE_HOTSPOT_INFO_SPACE).to.equal(encoded.length + PAD);
  });
});
