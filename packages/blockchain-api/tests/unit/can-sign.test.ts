import { Keypair } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { expect } from "chai";
import { describe, it } from "mocha";
import { canSign } from "../../src/lib/utils/can-sign";

describe("canSign", () => {
  it("is true for a keypair wallet", () => {
    expect(canSign(Keypair.generate().publicKey)).to.eq(true);
  });

  it("is false for a Squads vault, which is a program address", () => {
    const [vault] = multisig.getVaultPda({
      multisigPda: Keypair.generate().publicKey,
      index: 0,
    });
    expect(canSign(vault)).to.eq(false);
  });
});
