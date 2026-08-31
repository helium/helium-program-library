import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { VersionedTransaction } from "@solana/web3.js";
import { call, ORPCError } from "@orpc/server";
import { expect } from "chai";
import { after, afterEach, before, describe, it } from "mocha";
import { MIN_WALLET_RENT_LAMPORTS } from "../../src/lib/utils/balance-validation";

/**
 * Type-only, so naming the handler here does not import it: the module reads a
 * validated env at load, which only exists once `before` has set one up.
 */
type TransferModule =
  typeof import("../../src/server/api/routers/tokens/procedures/transfer");

const WALLET = "GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172";
const FEE_PAYER = "ATGQKkmNat3N8ZXM2ChEKMNAQ45isPPfUpBrAnvX9J8R";
const DESTINATION = "8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF";
const MULTISIG = "7iudHEnL3sjaGU62A6zH1CfeDLbKqAZ9FpBkbAQfTvDS";
const HNT_MINT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** Lamports the stub reports per address, rewritten by the balance tests. */
const balances = new Map<string, number>();
const DEFAULT_BALANCE = 5_000_000_000;
/** What the stub's getFeeForMessage charges for any transaction. */
const STUB_TX_FEE = 10000;

const withContext = (value: unknown) => ({
  context: { apiVersion: "2.0.0", slot: 1 },
  value,
});

/**
 * The RPC answers the transfer endpoint needs. Everything it does not answer —
 * simulation, priority-fee estimation — the build path already treats as
 * unavailable and falls back from, so the transaction is still produced.
 */
function rpcResult(method: string, params: unknown[]): unknown {
  switch (method) {
    case "getLatestBlockhash":
      return withContext({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1000,
      });
    case "getAccountInfo":
      return withContext(null);
    case "getBalance":
      return withContext(balances.get(params[0] as string) ?? DEFAULT_BALANCE);
    case "getFeeForMessage":
      return withContext(STUB_TX_FEE);
    case "getRecentPrioritizationFees":
      return [];
    default:
      return undefined;
  }
}

interface JsonRpcRequest {
  id: unknown;
  method: string;
  params: unknown[];
}

let server: Server;

function startStubRpc(): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const answer = ({ id, method, params }: JsonRpcRequest) => {
          const result = rpcResult(method, params ?? []);
          return result === undefined
            ? {
                jsonrpc: "2.0",
                id,
                error: { code: -32601, message: `unstubbed: ${method}` },
              }
            : { jsonrpc: "2.0", id, result };
        };
        const parsed = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify(
            Array.isArray(parsed) ? parsed.map(answer) : answer(parsed)
          )
        );
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

/** The transfer request, with only the fields a case varies spelled out. */
const request = (extra: Record<string, unknown> = {}) => ({
  walletAddress: WALLET,
  destination: DESTINATION,
  tokenAmount: { amount: "100000000", mint: HNT_MINT },
  ...extra,
});

describe("POST /tokens/transfer fee payer", () => {
  let transfer: TransferModule["transfer"];

  const transferred = async (input: ReturnType<typeof request>) => {
    const result = await call(transfer, input);
    return {
      tag: result.transactionData.tag,
      tx: VersionedTransaction.deserialize(
        Buffer.from(
          result.transactionData.transactions[0].serializedTransaction,
          "base64"
        )
      ),
    };
  };

  /** Every account the built transaction requires a signature from. */
  const signers = (tx: VersionedTransaction) =>
    tx.message.staticAccountKeys
      .slice(0, tx.message.header.numRequiredSignatures)
      .map((key) => key.toBase58());

  /** The account funding the recipient's associated token account. */
  const ataFunder = (tx: VersionedTransaction) => {
    const keys = tx.message.staticAccountKeys;
    const createAta = tx.message.compiledInstructions.find((ix) =>
      keys[ix.programIdIndex].equals(ASSOCIATED_TOKEN_PROGRAM_ID)
    );
    if (!createAta) throw new Error("no associated-token instruction");
    return keys[createAta.accountKeyIndexes[0]].toBase58();
  };

  before(async () => {
    // Every server variable the env schema requires without a default, set
    // here rather than read from a file so the run does not depend on a
    // developer's local environment. The RPC url points at the stub.
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.PRIVY_APP_SECRET = "test";
    process.env.BRIDGE_API_KEY = "test";
    process.env.JUPITER_API_KEY = "test";
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test";
    process.env.NO_PG = "true";
    process.env.SOLANA_RPC_URL = await startStubRpc();
    ({ transfer } = await import(
      "../../src/server/api/routers/tokens/procedures/transfer"
    ));
  });

  after(() => {
    server?.closeAllConnections?.();
    server?.close();
  });

  afterEach(() => balances.clear());

  it("pays from the wallet and needs one signature when none is named", async () => {
    const { tx } = await transferred(request());
    expect(signers(tx)).to.deep.eq([WALLET]);
    expect(ataFunder(tx)).to.eq(WALLET);
  });

  it("pays from the named fee payer and needs both signatures", async () => {
    const { tx } = await transferred(request({ feePayer: FEE_PAYER }));
    expect(signers(tx)).to.deep.eq([FEE_PAYER, WALLET]);
  });

  it("funds the recipient's token account from the named fee payer", async () => {
    const { tx } = await transferred(request({ feePayer: FEE_PAYER }));
    expect(ataFunder(tx)).to.eq(FEE_PAYER);
  });

  it("tags a fee-payer transfer apart from the same transfer without one", async () => {
    const plain = await transferred(request());
    const paid = await transferred(request({ feePayer: FEE_PAYER }));
    expect(paid.tag).to.not.eq(plain.tag);
  });

  it("charges a SOL transfer to the wallet, not the fee payer", async () => {
    balances.set(WALLET, 99_999_999);
    const error = await call(
      transfer,
      request({
        feePayer: FEE_PAYER,
        tokenAmount: { amount: "100000000", mint: WSOL_MINT },
      })
    ).catch((e) => e);

    expect(error).to.be.instanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).to.eq(
      "INSUFFICIENT_FUNDS"
    );
    expect((error as ORPCError<string, unknown>).message).to.eq(
      "Insufficient SOL balance for transfer"
    );
    expect((error as ORPCError<string, { required: number }>).data).to.deep.eq({
      required: 100_000_000,
      available: 99_999_999,
    });
  });

  it("charges the fee to the fee payer without the transfer amount", async () => {
    balances.set(FEE_PAYER, 1000);
    const error = await call(
      transfer,
      request({
        feePayer: FEE_PAYER,
        tokenAmount: { amount: "100000000", mint: WSOL_MINT },
      })
    ).catch((e) => e);

    expect((error as ORPCError<string, unknown>).message).to.eq(
      "Insufficient SOL balance for transaction fees"
    );
    // The stub's fee plus the min-wallet buffer, and not a lamport of the
    // 100_000_000 being transferred.
    expect((error as ORPCError<string, unknown>).data).to.deep.eq({
      required: STUB_TX_FEE + MIN_WALLET_RENT_LAMPORTS,
      available: 1000,
    });
  });

  it("proposes through the vault when only multisig is given", async () => {
    const error = await call(
      transfer,
      request({ multisig: MULTISIG })
    ).catch((e) => e);

    // The propose path reads the multisig account, which the stub does not
    // serve — far enough to prove input validation let it through.
    expect((error as ORPCError<string, unknown>).code).to.not.eq("BAD_REQUEST");
  });

  it("refuses a fee payer alongside a multisig", async () => {
    const error = await call(
      transfer,
      request({ feePayer: FEE_PAYER, multisig: MULTISIG })
    ).catch((e) => e);

    expect(error).to.be.instanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).to.eq("BAD_REQUEST");
    expect((error as ORPCError<string, unknown>).message).to.eq(
      "feePayer is not supported with multisig"
    );
  });
});
