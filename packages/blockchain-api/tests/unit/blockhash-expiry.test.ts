import { expect } from "chai";
import { describe, it } from "mocha";
import { probeBlockhashValidity } from "../../src/lib/utils/blockhash-expiry";

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
