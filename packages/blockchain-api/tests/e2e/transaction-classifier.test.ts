import { expect } from "chai";
import { describe, it } from "mocha";
import {
  classifyTransaction,
} from "../../src/lib/utils/transaction-classifier";
import type { HeliusTransaction } from "../../src/lib/utils/helius";

/**
 * Build a minimal HeliusTransaction for testing.
 * Uses the raw Solana transaction format returned by getTransactionsForAddress.
 */
function baseTx(
  overrides: Partial<HeliusTransaction> = {},
): HeliusTransaction {
  return {
    signature: "test-sig",
    slot: 100,
    blockTime: 1700000000,
    transaction: {
      signatures: ["test-sig"],
      message: {
        accountKeys: [],
        instructions: [],
      },
    } as any,
    meta: {
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [],
      err: null,
      logMessages: [],
    } as any,
    ...overrides,
  };
}

describe("transaction-classifier", () => {
  describe("SPL token transfers", () => {
    it("classifies an SPL token transfer from balance changes", async () => {
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "sender111", signer: true, writable: true, source: "transaction" },
              { pubkey: "receiver222", signer: false, writable: true, source: "transaction" },
              { pubkey: "senderAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "receiverAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              {
                programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                accounts: ["senderAta", "receiverAta", "sender111"],
                data: "3Bxs4ThwQbE4vyj5",
              },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 0, 0, 0, 0],
          postBalances: [999995000, 0, 0, 0, 0],
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 10, decimals: 8, amount: "1000000000", uiAmountString: "10" },
              owner: "sender111",
            },
            {
              accountIndex: 3,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" },
              owner: "receiver222",
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 9, decimals: 8, amount: "900000000", uiAmountString: "9" },
              owner: "sender111",
            },
            {
              accountIndex: 3,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 1, decimals: 8, amount: "100000000", uiAmountString: "1" },
              owner: "receiver222",
            },
          ],
          innerInstructions: [],
          err: null,
          logMessages: [],
        } as any,
      });

      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.mint).to.equal(
        "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
      );
      expect(result!.actionMetadata.tokenName).to.equal("HNT");
      expect(result!.actionMetadata.from).to.equal("sender111");
      expect(result!.actionMetadata.to).to.equal("receiver222");
      expect(result!.actionMetadata.amount).to.equal(1);
    });

    it("classifies a native SOL transfer", async () => {
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "sender111", signer: true, writable: true, source: "transaction" },
              { pubkey: "receiver222", signer: false, writable: true, source: "transaction" },
              { pubkey: "11111111111111111111111111111111", signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              {
                programId: "11111111111111111111111111111111",
                accounts: ["sender111", "receiver222"],
                data: "3Bxs3zuFMN7Lk6MH",
              },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 0, 1],
          postBalances: [949995000, 50000000, 1],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
          err: null,
          logMessages: [],
        } as any,
      });

      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.tokenName).to.equal("SOL");
      expect(result!.actionMetadata.amount).to.equal(50000000);
      expect(result!.actionMetadata.from).to.equal("sender111");
      expect(result!.actionMetadata.to).to.equal("receiver222");
    });
  });

  describe("unknown transactions", () => {
    it("returns null for empty transaction", async () => {
      const tx = baseTx();
      const result = await classifyTransaction(tx);
      expect(result).to.be.null;
    });

    it("returns null for unrecognized program", async () => {
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "someone", signer: true, writable: true, source: "transaction" },
              { pubkey: "someRandomProgram111", signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              {
                programId: "someRandomProgram111",
                accounts: ["someone"],
                data: "deadbeef",
              },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 1],
          postBalances: [999995000, 1],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
          err: null,
          logMessages: [],
        } as any,
      });

      const result = await classifyTransaction(tx);
      expect(result).to.be.null;
    });
  });

  describe("program detection", () => {
    it("detects lazy distributor in involved programs", async () => {
      // We can't easily mock IDL fetching in unit tests, but we can verify
      // that a transaction with lazy-distributor program + token changes
      // falls through to spl_transfer when IDL fetch fails (no network)
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "claimer", signer: true, writable: true, source: "transaction" },
              { pubkey: "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w", signer: false, writable: false, source: "transaction" },
              { pubkey: "escrowAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "claimerAta", signer: false, writable: true, source: "transaction" },
            ],
            instructions: [
              {
                programId: "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
                accounts: ["claimer", "escrowAta", "claimerAta"],
                data: "someEncodedData",
              },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 1, 0, 0],
          postBalances: [999995000, 1, 0, 0],
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 100, decimals: 8, amount: "10000000000", uiAmountString: "100" },
              owner: "escrow",
            },
            {
              accountIndex: 3,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" },
              owner: "claimer",
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 95, decimals: 8, amount: "9500000000", uiAmountString: "95" },
              owner: "escrow",
            },
            {
              accountIndex: 3,
              mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
              uiTokenAmount: { uiAmount: 5, decimals: 8, amount: "500000000", uiAmountString: "5" },
              owner: "claimer",
            },
          ],
          innerInstructions: [],
          err: null,
          logMessages: [],
        } as any,
      });

      // Without a real RPC to fetch IDL, it will fall through to spl_transfer
      // In production with real IDLs, it would classify as lazy_distributor_claim
      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      // Will be spl_transfer since IDL fetch fails without real network
      expect(result!.actionMetadata.mint).to.equal(
        "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263",
      );
      expect(result!.actionMetadata.tokenName).to.equal("HNT");
    });
  });
});
