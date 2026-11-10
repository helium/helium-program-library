import { toVersionedTx, type TransactionDraft } from "@helium/spl-utils";
import {
  AddressLookupTableAccount,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  buildBundleTipDraft,
  fitsOneBundle,
  maxPackedTxs,
  shouldUseJitoBundle,
} from "../../src/lib/utils/jito-bundle";

describe("maxPackedTxs", () => {
  it("keeps one bundle slot free for the tip on a Jito cluster", () => {
    expect(maxPackedTxs("mainnet")).to.equal(4);
    expect(maxPackedTxs("mainnet-beta")).to.equal(4);
  });

  it("uses the whole bundle limit off a Jito cluster", () => {
    expect(maxPackedTxs("devnet")).to.equal(5);
  });

  it("keeps the tip slot inside a caller's smaller limit", () => {
    expect(maxPackedTxs("mainnet", 2)).to.equal(1);
    expect(maxPackedTxs("devnet", 2)).to.equal(2);
  });
});

describe("shouldUseJitoBundle", () => {
  it("bundles more than one tx on mainnet only", () => {
    expect(shouldUseJitoBundle(1, "mainnet")).to.equal(false);
    expect(shouldUseJitoBundle(2, "mainnet")).to.equal(true);
    expect(shouldUseJitoBundle(4, "devnet")).to.equal(false);
  });
});

describe("buildBundleTipDraft", () => {
  for (const version of [0, 1] as const) {
    describe(`version ${version}`, () => {
      const feePayerKeypair = Keypair.generate();
      const feePayer = feePayerKeypair.publicKey;
      const source = Keypair.generate().publicKey;
      const lookupTable = new AddressLookupTableAccount({
        key: Keypair.generate().publicKey,
        state: {
          deactivationSlot: BigInt("18446744073709551615"),
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: [Keypair.generate().publicKey],
        },
      });
      const template: TransactionDraft = {
        instructions: [],
        feePayer,
        recentBlockhash: Keypair.generate().publicKey.toBase58(),
        addressLookupTables: [lookupTable],
        addressLookupTableAddresses: [lookupTable.key],
        version,
      };
      const tipIx = SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: Keypair.generate().publicKey,
        lamports: 10000,
      });
      const draft = buildBundleTipDraft({
        tipIx,
        signer: source,
        feePayer,
        template,
      });

      it("signs and serializes with the template's blockhash", () => {
        const tx = toVersionedTx(draft);
        expect(() => tx.sign([feePayerKeypair])).to.not.throw();
        expect(() => tx.serialize()).to.not.throw();
        expect(tx.message.recentBlockhash).to.equal(template.recentBlockhash);
      });

      it("keeps the template's version", () => {
        expect(draft.version).to.equal(version);
        expect(toVersionedTx(draft).version).to.equal(version);
      });

      it("keeps the template's lookup tables", () => {
        expect(draft.addressLookupTables).to.equal(
          template.addressLookupTables
        );
        expect(draft.addressLookupTableAddresses).to.equal(
          template.addressLookupTableAddresses
        );
        expect(() => toVersionedTx(draft)).to.not.throw();
      });

      it("requires the source as a read-only signer", () => {
        const { message } = toVersionedTx(draft);
        expect(message.header.numRequiredSignatures).to.equal(2);
        const index = message.staticAccountKeys
          .slice(0, 2)
          .findIndex((key) => key.equals(source));
        expect(index).to.not.equal(-1);
        expect(message.isAccountWritable(index)).to.equal(false);
      });
    });
  }
});

describe("fitsOneBundle", () => {
  it("fits a setup that fills the mainnet packed slots", () => {
    expect(fitsOneBundle(4)).to.equal(true);
  });

  it("rejects a setup one transaction past the mainnet packed slots", () => {
    expect(fitsOneBundle(5)).to.equal(false);
  });
});
