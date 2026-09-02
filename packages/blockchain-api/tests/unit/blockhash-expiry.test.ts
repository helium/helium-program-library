import { expect } from "chai";
import { describe, it } from "mocha";
import {
  deriveLastValidBlockHeight,
  probeBlockhashValidity,
} from "../../src/lib/utils/blockhash-expiry";

describe("deriveLastValidBlockHeight", () => {
  it("records a lifetime for a transaction whose own blockhash the cluster still accepts", () => {
    expect(
      deriveLastValidBlockHeight({
        blockhashValid: true,
        latestLastValidBlockHeight: 400,
      }),
    ).to.equal(400);
  });

  it("records no lifetime for a transaction whose own blockhash is already dead", () => {
    expect(
      deriveLastValidBlockHeight({
        blockhashValid: false,
        latestLastValidBlockHeight: 400,
      }),
    ).to.equal(undefined);
  });

  it("records no lifetime when the probe could not answer, rather than a different blockhash's", () => {
    expect(
      deriveLastValidBlockHeight({
        blockhashValid: undefined,
        latestLastValidBlockHeight: 400,
      }),
    ).to.equal(undefined);
  });
});

describe("probeBlockhashValidity", () => {
  it("asks once per distinct blockhash", async () => {
    const asked: string[] = [];
    const validity = await probeBlockhashValidity(
      {
        async isBlockhashValid(blockhash) {
          asked.push(blockhash);
          return { value: true };
        },
      },
      ["hashA", "hashA", "hashB"],
    );

    expect(asked).to.deep.equal(["hashA", "hashB"]);
    expect(validity.get("hashA")).to.equal(true);
  });

  it("leaves out a blockhash the cluster could not answer for", async () => {
    const validity = await probeBlockhashValidity(
      {
        async isBlockhashValid(blockhash) {
          if (blockhash === "hashA") {
            throw new Error("503 Service Unavailable");
          }
          return { value: false };
        },
      },
      ["hashA", "hashB"],
    );

    expect(validity.has("hashA")).to.equal(false);
    expect(validity.get("hashB")).to.equal(false);
  });
});
