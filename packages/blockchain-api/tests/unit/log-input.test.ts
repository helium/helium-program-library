import { expect } from "chai";
import { describe, it } from "mocha";
import { CreateBankAccountInputSchema } from "../../../blockchain-api-client/src/schemas/fiat";
import { summarizeProcedureInput } from "../../src/lib/utils/log-input";

/** A filled-in `fiat.createBankAccount` input, the worst case for the log. */
const BANK_ACCOUNT = CreateBankAccountInputSchema.parse({
  currency: "usd",
  account_type: "checking",
  bank_name: "Example Bank",
  account_name: "Primary",
  first_name: "Ada",
  last_name: "Lovelace",
  account: {
    account_number: "000123456789",
    routing_number: "021000021",
    checking_or_savings: "checking",
  },
  address: {
    street_line_1: "1 Analytical Engine Way",
    city: "London",
    state: "LDN",
    postal_code: "NW1",
    country: "GB",
  },
});

/** Every string anywhere in a value, so a test can assert none of it is logged. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(strings);
}

describe("summarizeProcedureInput", () => {
  it("logs nothing for an input with no fields", () => {
    expect(summarizeProcedureInput({})).to.equal("");
    expect(summarizeProcedureInput(undefined)).to.equal("");
    expect(summarizeProcedureInput(null)).to.equal("");
    expect(summarizeProcedureInput("a string")).to.equal("");
  });

  it("logs the value of an allowlisted field", () => {
    expect(
      summarizeProcedureInput({ walletAddress: "GZairnxHiWXk73Yhs" })
    ).to.equal(' {walletAddress="GZairnxHiWXk73Yhs"}');
  });

  it("logs an unlisted field by name only", () => {
    expect(summarizeProcedureInput({ secretToken: "s3cret" })).to.equal(
      " {secretToken}"
    );
  });

  it("keeps the order and separates the fields", () => {
    expect(
      summarizeProcedureInput({ walletAddress: "abc", amount: "5" })
    ).to.equal(' {walletAddress="abc", amount}');
  });

  it("logs no part of a bank account, not even the fields it lists", () => {
    const line = summarizeProcedureInput(BANK_ACCOUNT);

    for (const secret of strings(BANK_ACCOUNT)) {
      expect(line, `leaked ${secret}`).to.not.contain(secret);
    }
    expect(line).to.contain("account_name");
    expect(line).to.contain("account");
    expect(line).to.contain("address");
  });

  it("stops logging a listed field whose value stops being a scalar", () => {
    // A schema that nests something under a name that used to hold a string
    // does not start logging what it nested.
    expect(
      summarizeProcedureInput({ owner: { address: "GZairnxHiWXk73Yhs" } })
    ).to.equal(" {owner}");
    expect(summarizeProcedureInput({ owner: ["GZairnxHiWXk73Yhs"] })).to.equal(
      " {owner}"
    );
  });

  it("logs a listed field's scalar value whatever its type", () => {
    expect(
      summarizeProcedureInput({ parallel: true, simulate: false, type: 3 })
    ).to.equal(" {parallel=true, simulate=false, type=3}");
  });

  it("does not take a value from Object.prototype for an unlisted name", () => {
    expect(
      summarizeProcedureInput({ constructor: "x", toString: "y" })
    ).to.equal(" {constructor, toString}");
  });
});
