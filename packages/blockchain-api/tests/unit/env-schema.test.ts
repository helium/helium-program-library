import { expect } from "chai";
import { describe, it, before } from "mocha";

const REQUIRED = {
  PG_USER: "test",
  PG_NAME: "test",
  PG_HOST: "localhost",
  PG_PORT: "5432",
  JUPITER_API_KEY: "test",
  NO_PG: "true",
};

describe("envSchema", () => {
  let envSchema: typeof import("../../src/lib/env").envSchema;

  before(async () => {
    Object.assign(process.env, REQUIRED);
    ({ envSchema } = await import("../../src/lib/env"));
  });

  function parse(vars: Record<string, string | undefined>) {
    return envSchema.safeParse(
      Object.fromEntries(
        Object.entries({ ...REQUIRED, ...vars }).map(([key, value]) => [
          key,
          value === "" ? undefined : value,
        ]),
      ),
    );
  }

  it("trims SOLANA_CLUSTER", () => {
    const result = parse({ SOLANA_CLUSTER: "devnet " });
    expect(result.success).to.equal(true);
    expect(result.data?.SOLANA_CLUSTER).to.equal("devnet");
  });

  it("accepts mainnet-beta", () => {
    const result = parse({ SOLANA_CLUSTER: "mainnet-beta" });
    expect(result.data?.SOLANA_CLUSTER).to.equal("mainnet-beta");
  });

  it("leaves SOLANA_CLUSTER undefined when unset or empty", () => {
    expect(parse({}).data?.SOLANA_CLUSTER).to.equal(undefined);
    const empty = parse({ SOLANA_CLUSTER: "" });
    expect(empty.success).to.equal(true);
    expect(empty.data?.SOLANA_CLUSTER).to.equal(undefined);
  });

  it("rejects an unknown cluster", () => {
    expect(parse({ SOLANA_CLUSTER: "testnet" }).success).to.equal(false);
  });

  it("rejects NEXT_PUBLIC_SOLANA_CLUSTER and names SOLANA_CLUSTER", () => {
    const result = parse({ NEXT_PUBLIC_SOLANA_CLUSTER: "devnet" });
    expect(result.success).to.equal(false);
    expect(result.error?.message).to.include(
      "NEXT_PUBLIC_SOLANA_CLUSTER was renamed to SOLANA_CLUSTER",
    );
  });
});
