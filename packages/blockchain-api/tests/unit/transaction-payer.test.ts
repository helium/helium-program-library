import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { verifiedFeePayer } from "../../src/lib/utils/transaction-payer";

/** A fixed blockhash, so a compiled message is a byte-for-byte constant. */
const BLOCKHASH = "11111111111111111111111111111111";

/** Keypairs derived from constants, so every run signs the same bytes. */
const FEE_PAYER = Keypair.fromSeed(Buffer.alloc(32, 1));
const AUTHORITY = Keypair.fromSeed(Buffer.alloc(32, 2));
const DESTINATION = new PublicKey(
  "8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF"
);

/**
 * A SOL transfer out of `AUTHORITY`, paid for by `payer`. Naming a payer other
 * than the source is what `/tokens/transfer` does when it is given a
 * third-party fee payer, and it compiles to two required signatures with the
 * payer first.
 */
function transfer(payer: PublicKey, lamports = 1000) {
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: BLOCKHASH,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: AUTHORITY.publicKey,
          toPubkey: DESTINATION,
          lamports,
        }),
      ],
    }).compileToV0Message()
  );
}

describe("verifiedFeePayer", () => {
  it("names the fee payer of a transaction it signed", () => {
    const tx = transfer(AUTHORITY.publicKey);
    tx.sign([AUTHORITY]);
    expect(verifiedFeePayer(tx)).to.equal(AUTHORITY.publicKey.toBase58());
  });

  it("accepts a two-signature transaction with a third-party fee payer", () => {
    const tx = transfer(FEE_PAYER.publicKey);
    expect(tx.message.header.numRequiredSignatures).to.equal(2);
    expect(tx.message.staticAccountKeys[0].toBase58()).to.equal(
      FEE_PAYER.publicKey.toBase58()
    );

    tx.sign([FEE_PAYER, AUTHORITY]);
    expect(verifiedFeePayer(tx)).to.equal(FEE_PAYER.publicKey.toBase58());
  });

  it("refuses an unsigned transaction", () => {
    expect(verifiedFeePayer(transfer(AUTHORITY.publicKey))).to.equal(null);
    expect(verifiedFeePayer(transfer(FEE_PAYER.publicKey))).to.equal(null);
  });

  it("refuses a transaction every account but the fee payer signed", () => {
    const tx = transfer(FEE_PAYER.publicKey);
    tx.sign([AUTHORITY]);
    expect(verifiedFeePayer(tx)).to.equal(null);
  });

  it("refuses a signature made over a different transaction", () => {
    const signed = transfer(FEE_PAYER.publicKey, 1000);
    signed.sign([FEE_PAYER, AUTHORITY]);

    const altered = transfer(FEE_PAYER.publicKey, 2000);
    altered.signatures = signed.signatures;
    expect(verifiedFeePayer(altered)).to.equal(null);
  });

  it("refuses a signature that is somebody else's", () => {
    const tx = transfer(FEE_PAYER.publicKey);
    const authoritySigned = transfer(FEE_PAYER.publicKey);
    authoritySigned.sign([AUTHORITY]);

    // The authority's signature over the same message, in the fee payer's slot.
    tx.signatures[0] = authoritySigned.signatures[1];
    expect(verifiedFeePayer(tx)).to.equal(null);
  });

  it("refuses a truncated or absent signature rather than throwing", () => {
    const tx = transfer(AUTHORITY.publicKey);
    tx.sign([AUTHORITY]);

    const truncated = transfer(AUTHORITY.publicKey);
    truncated.signatures = [tx.signatures[0].subarray(0, 32)];
    expect(verifiedFeePayer(truncated)).to.equal(null);

    const none = transfer(AUTHORITY.publicKey);
    none.signatures = [];
    expect(verifiedFeePayer(none)).to.equal(null);
  });
});
