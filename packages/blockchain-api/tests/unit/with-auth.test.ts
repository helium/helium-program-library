import { expect } from "chai";
import { call, os, ORPCError } from "@orpc/server";

describe("withAuth", () => {
  let whoAmI: any;
  let privy: any;
  let originalGetUser: any;
  let seenTokens: string[] = [];

  before(async () => {
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.PRIVY_APP_SECRET = "test";
    process.env.JUPITER_API_KEY = "test";
    process.env.PRIVY_APP_ID = "test";
    process.env.NO_PG = "true";
    const { withAuth } = await import("../../src/server/api/procedures");
    const { UNAUTHENTICATED } = await import("@helium/blockchain-api");
    ({ privy } = await import("../../src/lib/privy"));

    originalGetUser = privy.getUser;
    privy.getUser = async ({ idToken }: { idToken: string }) => {
      seenTokens.push(idToken);
      return idToken === "bad"
        ? null
        : { id: "did:privy:1", wallet: { address: "wallet1" } };
    };

    whoAmI = os
      .$context<{ reqHeaders?: Headers }>()
      .errors({ UNAUTHENTICATED })
      .use(withAuth)
      .handler(({ context }) => ({
        userId: context.session.userId,
        walletAddress: context.session.walletAddress,
      }));
  });

  beforeEach(() => {
    seenTokens = [];
  });

  after(() => {
    privy.getUser = originalGetUser;
  });

  const callWith = (headers?: Record<string, string>) =>
    call(whoAmI, undefined, {
      context: headers ? { reqHeaders: new Headers(headers) } : {},
    });

  const expectUnauthenticated = async (
    promise: Promise<unknown>,
    message: string,
  ) => {
    try {
      await promise;
      expect.fail("expected UNAUTHENTICATED");
    } catch (e) {
      expect(e).to.be.instanceOf(ORPCError);
      expect((e as ORPCError<string, unknown>).code).to.equal(
        "UNAUTHENTICATED",
      );
      expect((e as ORPCError<string, unknown>).status).to.equal(401);
      expect((e as ORPCError<string, unknown>).message).to.equal(message);
    }
  };

  it("rejects a request with no token", async () => {
    await expectUnauthenticated(callWith(), "No authentication token provided");
    await expectUnauthenticated(
      callWith({ authorization: "Basic abc" }),
      "No authentication token provided",
    );
  });

  it("rejects a token Privy does not recognise", async () => {
    await expectUnauthenticated(
      callWith({ authorization: "Bearer bad" }),
      "Invalid authentication token",
    );
  });

  it("accepts a bearer token", async () => {
    const result = await callWith({ authorization: "Bearer tok-bearer" });
    expect(result).to.deep.equal({
      userId: "did:privy:1",
      walletAddress: "wallet1",
    });
    expect(seenTokens).to.deep.equal(["tok-bearer"]);
  });

  it("prefers the privy-id-token cookie over the bearer token", async () => {
    await callWith({
      cookie: "other=1; privy-id-token=tok-cookie",
      authorization: "Bearer tok-bearer",
    });
    expect(seenTokens).to.deep.equal(["tok-cookie"]);
  });
});
