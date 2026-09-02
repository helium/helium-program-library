import { createServer, Server } from "http";
import { AddressInfo } from "net";
import {
  delegatedPositionKey,
  PROGRAM_ID as HSD_PROGRAM_ID,
} from "@helium/helium-sub-daos-sdk";
import {
  delegationClaimBotKey,
  PROGRAM_ID as HPL_CRONS_PROGRAM_ID,
} from "@helium/hpl-crons-sdk";
import { PROGRAM_ID as PROXY_PROGRAM_ID } from "@helium/nft-proxy-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import {
  positionKey,
  PROGRAM_ID as VSR_PROGRAM_ID,
} from "@helium/voter-stake-registry-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { DEFAULT_HPL_CRONS_TASK_QUEUE } from "./helpers/constants";
import {
  createAndFundPosition,
  setDelegatedPositionExpiration,
} from "./helpers/governance";
import { stopNextServer } from "./helpers/next";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";

const EPOCH_LENGTH = 86400;

/**
 * Where Anchor keeps a program's IDL. `Program.fetchIdl` reads exactly this
 * account, so a request that asks for none of them fetched no IDL — and every
 * account resolver in `@helium/helium-sub-daos-sdk` starts by fetching one.
 */
const idlAddress = async (programId: PublicKey) => {
  const [base] = PublicKey.findProgramAddressSync([], programId);
  return PublicKey.createWithSeed(base, "anchor:idl", programId);
};

/** IDL account to program name, filled in once the addresses are derived. */
const idlAccounts = new Map<string, string>();

const collectIdlAccounts = async () => {
  const programs = [
    ["voter-stake-registry", VSR_PROGRAM_ID],
    ["helium-sub-daos", HSD_PROGRAM_ID],
    ["nft-proxy", PROXY_PROGRAM_ID],
    ["hpl-crons", HPL_CRONS_PROGRAM_ID],
  ] as const;

  for (const [name, programId] of programs) {
    idlAccounts.set((await idlAddress(programId)).toBase58(), name);
  }
};

interface RpcCall {
  method: string;
  params: unknown[];
}

/**
 * A pass-through RPC that records every call made through it. The API server
 * runs in this process but its own module registry, so its connection is out of
 * reach; pointing it at this instead is what makes its calls countable.
 */
const startRecordingRpc = async (upstream: string) => {
  const calls: RpcCall[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      for (const entry of [JSON.parse(body)].flat()) {
        calls.push({ method: entry.method, params: entry.params ?? [] });
      }

      try {
        const answer = await fetch(upstream, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        res.writeHead(answer.status, { "content-type": "application/json" });
        res.end(await answer.text());
      } catch (err) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;

  return { calls, server, url: `http://127.0.0.1:${port}` };
};

/** The programs whose IDL account the recorded calls asked for. */
const idlReads = (calls: RpcCall[]) =>
  calls.flatMap((rpcCall) => {
    const asked = JSON.stringify(rpcCall.params);
    return [...idlAccounts.entries()]
      .filter(([account]) => asked.includes(account))
      .map(([, name]) => name);
  });

/**
 * How many single-account reads asked for this address. A batched read is a
 * `getMultipleAccounts`, so anything counted here is a round trip the request
 * spent on one position alone.
 */
const singleAccountReads = (calls: RpcCall[], account: PublicKey) =>
  calls.filter(
    (rpcCall) =>
      rpcCall.method === "getAccountInfo" &&
      JSON.stringify(rpcCall.params).includes(account.toBase58()),
  ).length;

describe("delegatePositions account resolution", () => {
  let ctx: TestCtx;
  let rpc: Awaited<ReturnType<typeof startRecordingRpc>>;

  before(async () => {
    await collectIdlAccounts();
    // Surfpool first, so the recorder has a live upstream to forward to.
    await ensureSurfpool();
    rpc = await startRecordingRpc(getSurfpoolRpcUrl());
    ctx = await setupTestCtx({ serverRpcUrl: rpc.url });
  });

  after(async () => {
    await stopNextServer();
    rpc?.server.closeAllConnections?.();
    rpc?.server.close();
    await stopSurfpool();
  });

  it("fetches no program IDL while re-delegating an expired position", async () => {
    // #given a MOBILE delegation whose expiration has passed, so the request
    // takes the close-then-delegate path Anchor's resolvers are slow on
    const { positionMint } = await createAndFundPosition(ctx, {
      amount: "100000000",
      lockupKind: "cliff",
      lockupPeriodsInDays: 365,
      subDaoMint: MOBILE_MINT,
    });

    const [positionPubkey] = positionKey(new PublicKey(positionMint));
    const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);
    const clock = await ctx.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const now = Number(clock!.data.readBigInt64LE(32));
    // Inside the current epoch, so the closing-time epoch info the program
    // expects is the one delegating already created.
    const epochStart = Math.floor(now / EPOCH_LENGTH) * EPOCH_LENGTH;
    await setDelegatedPositionExpiration(
      ctx,
      delegatedPosPubkey,
      Math.max(epochStart + 1, now - 60),
      epochStart,
    );

    const input = {
      walletAddress: ctx.payer.publicKey.toBase58(),
      positionMints: [positionMint],
      subDaoMint: MOBILE_MINT.toBase58(),
      automationEnabled: false,
    };

    // #when the endpoint builds the same request twice
    await ctx.client.governance.delegatePositions(input);
    rpc.calls.length = 0;
    const result = await ctx.client.governance.delegatePositions(input);

    // #then the second build reads no IDL: the process already has every one,
    // and no account resolver ran to ask for another
    expect(rpc.calls.length).to.be.greaterThan(
      0,
      "recorded no RPC at all, so the server is not talking through the recorder",
    );
    expect(idlReads(rpc.calls)).to.deep.equal([]);
    // The expired path is the one being measured, so fail loudly if the
    // fixture stops producing it.
    expect(
      result.transactionData.transactions.map((tx) => tx.metadata?.type),
    ).to.include("delegation_close_expired");
  });

  it("reads ownership and claim bots in batches, not once per position", async () => {
    // #given two undelegated positions to automate in one request
    const positions = await Promise.all([
      createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
        subDaoMint: MOBILE_MINT,
      }),
      createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
        subDaoMint: MOBILE_MINT,
      }),
    ]);

    const taskQueue = new PublicKey(DEFAULT_HPL_CRONS_TASK_QUEUE);
    const perPositionAccounts = positions.flatMap(({ positionMint }) => {
      const mint = new PublicKey(positionMint);
      const [positionPubkey] = positionKey(mint);
      const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);
      return [
        // The ownership check's ATA.
        getAssociatedTokenAddressSync(mint, ctx.payer.publicKey, true),
        // The claim bot, read to decide whether one must be created.
        delegationClaimBotKey(taskQueue, delegatedPosPubkey)[0],
      ];
    });

    // #when the endpoint builds the request
    rpc.calls.length = 0;
    const { data, error } = await ctx.safeClient.governance.delegatePositions({
      walletAddress: ctx.payer.publicKey.toBase58(),
      positionMints: positions.map(({ positionMint }) => positionMint),
      subDaoMint: MOBILE_MINT.toBase58(),
      automationEnabled: true,
    });

    // #then it read none of the per-position accounts on its own
    if (error) {
      expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
    }
    expect(
      data.transactionData.transactions.map((tx) => tx.metadata?.type),
    ).to.include("delegation_automation");
    for (const account of perPositionAccounts) {
      expect(
        singleAccountReads(rpc.calls, account),
        `${account.toBase58()} was read one position at a time`,
      ).to.equal(0);
    }
  });
});
