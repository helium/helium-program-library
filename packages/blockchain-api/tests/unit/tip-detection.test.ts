import { expect } from "chai";
import { describe, it } from "mocha";
import {
  isClientCraftedBundleTag,
  messageWriteLocksAnyAccount,
  type MinimalCompiledMessage,
} from "../../src/lib/utils/submission-helpers";

const key = (name: string) => ({ toBase58: () => name });

// A typical tip transfer message: [payer (writable signer), tipAccount
// (writable), systemProgram (readonly)]
const tipTransfer: MinimalCompiledMessage = {
  staticAccountKeys: [key("payer"), key("tipAccount"), key("systemProgram")],
  header: {
    numRequiredSignatures: 1,
    numReadonlySignedAccounts: 0,
    numReadonlyUnsignedAccounts: 1,
  },
};

describe("messageWriteLocksAnyAccount", () => {
  it("detects a write-locked unsigned account", () => {
    expect(
      messageWriteLocksAnyAccount(tipTransfer, new Set(["tipAccount"])),
    ).to.equal(true);
  });

  it("detects a write-locked signer account", () => {
    expect(
      messageWriteLocksAnyAccount(tipTransfer, new Set(["payer"])),
    ).to.equal(true);
  });

  it("ignores readonly accounts", () => {
    expect(
      messageWriteLocksAnyAccount(tipTransfer, new Set(["systemProgram"])),
    ).to.equal(false);
  });

  it("ignores readonly signed accounts", () => {
    const message: MinimalCompiledMessage = {
      staticAccountKeys: [key("payer"), key("readonlySigner"), key("program")],
      header: {
        numRequiredSignatures: 2,
        numReadonlySignedAccounts: 1,
        numReadonlyUnsignedAccounts: 1,
      },
    };
    expect(
      messageWriteLocksAnyAccount(message, new Set(["readonlySigner"])),
    ).to.equal(false);
  });

  it("returns false when no account matches", () => {
    expect(
      messageWriteLocksAnyAccount(tipTransfer, new Set(["someOtherAccount"])),
    ).to.equal(false);
  });
});

describe("isClientCraftedBundleTag", () => {
  it("matches claim-rewards tags from wallet-app", () => {
    expect(isClientCraftedBundleTag("claim-rewards")).to.equal(true);
    expect(isClientCraftedBundleTag("claim-rewards-iot")).to.equal(true);
  });

  it("matches implicit-burn tags from older wallet-app releases", () => {
    expect(isClientCraftedBundleTag("implicit-burn-abc123")).to.equal(true);
  });

  it("does not match server-crafted tags", () => {
    expect(isClientCraftedBundleTag("claim_rewards_tuktuk:wallet")).to.equal(
      false,
    );
    expect(isClientCraftedBundleTag("treasury-swap-abc")).to.equal(false);
  });

  it("returns false for an absent tag", () => {
    expect(isClientCraftedBundleTag(undefined)).to.equal(false);
  });
});
