import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { validateMigrateWallets } from "../src/validate";

describe("validateMigrateWallets", () => {
  const feePayer = Keypair.generate().publicKey;
  const from = Keypair.generate().publicKey;
  const to = Keypair.generate().publicKey;

  it("accepts distinct on-curve wallets that are not the fee payer", () => {
    expect(validateMigrateWallets(from, to, feePayer)).to.equal(undefined);
  });

  it("rejects the fee payer as source", () => {
    expect(validateMigrateWallets(feePayer, to, feePayer)).to.equal(
      "Invalid source wallet"
    );
  });

  it("rejects the fee payer as destination", () => {
    expect(validateMigrateWallets(from, feePayer, feePayer)).to.equal(
      "Invalid destination wallet"
    );
  });

  it("rejects source equal to destination", () => {
    expect(validateMigrateWallets(from, from, feePayer)).to.equal(
      "Source and destination must differ"
    );
  });

  it("rejects an off-curve destination", () => {
    const [offCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from("migration-test")],
      SystemProgram.programId
    );
    expect(PublicKey.isOnCurve(offCurve.toBytes())).to.equal(false);
    expect(validateMigrateWallets(from, offCurve, feePayer)).to.equal(
      "Destination must be on-curve"
    );
  });
});
