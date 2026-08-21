import { SubmitInputSchema } from "@helium/blockchain-api";
import { expect } from "chai";
import { describe, it } from "mocha";

const submitInput = (tag: string) => ({
  transactions: [{ serializedTransaction: "AAAA" }],
  parallel: false,
  tag,
});

describe("SubmitInputSchema tag bound", () => {
  it("accepts a tag longer than the old varchar(255) column", () => {
    // The wallet app's multi-recipient payment tag reaches ~712 chars, which
    // used to crash submit with a raw 500 against varchar(255).
    const parsed = SubmitInputSchema.parse(submitInput("t".repeat(712)));
    expect(parsed.tag).to.have.length(712);
  });

  it("accepts a tag at the bound", () => {
    expect(SubmitInputSchema.safeParse(submitInput("t".repeat(1000))).success)
      .to.be.true;
  });

  it("rejects a multibyte tag that exceeds the index's byte budget", () => {
    // 1000 chars but 3000 UTF-8 bytes — would overflow the (tag, payer)
    // partial unique btree index's ~2704-byte tuple limit.
    expect(SubmitInputSchema.safeParse(submitInput("好".repeat(1000))).success)
      .to.be.false;
  });

  it("rejects a tag over the bound so it fails as a 400, not a 500", () => {
    expect(SubmitInputSchema.safeParse(submitInput("t".repeat(1001))).success)
      .to.be.false;
  });
});
