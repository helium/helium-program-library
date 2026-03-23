import { expect } from "chai";
import { describe, it } from "mocha";
import {
  classifyTransaction,
} from "../../src/lib/utils/transaction-classifier";
import type { HeliusTransaction } from "../../src/lib/utils/helius";
import bs58 from "bs58";

/** Encode an SPL Token Transfer instruction (discriminator 3 + u64 amount). */
function encodeSplTransfer(amount: number): string {
  const buf = Buffer.alloc(9);
  buf[0] = 3;
  buf.writeBigUInt64LE(BigInt(amount), 1);
  return bs58.encode(buf);
}

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

const HNT_MINT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("transaction-classifier", () => {
  describe("SPL token transfers", () => {
    it("classifies a single SPL token transfer from raw instruction", async () => {
      // accounts: [0]=sender, [1]=receiver, [2]=senderAta, [3]=receiverAta, [4]=tokenProgram
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "sender111", signer: true, writable: true, source: "transaction" },
              { pubkey: "receiver222", signer: false, writable: true, source: "transaction" },
              { pubkey: "senderAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "receiverAta", signer: false, writable: true, source: "transaction" },
              { pubkey: TOKEN_PROGRAM, signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              { programId: TOKEN_PROGRAM, accounts: [2, 3, 0], data: encodeSplTransfer(100000000) },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 0, 0, 0, 0],
          postBalances: [999995000, 0, 0, 0, 0],
          preTokenBalances: [
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 10, decimals: 8, amount: "1000000000", uiAmountString: "10" }, owner: "sender111" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "receiver222" },
          ],
          postTokenBalances: [
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 9, decimals: 8, amount: "900000000", uiAmountString: "9" }, owner: "sender111" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 1, decimals: 8, amount: "100000000", uiAmountString: "1" }, owner: "receiver222" },
          ],
          innerInstructions: [],
          err: null,
          logMessages: [],
        } as any,
      });

      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.mint).to.equal(HNT_MINT);
      expect(result!.actionMetadata.tokenName).to.equal("HNT");
      expect(result!.actionMetadata.from).to.equal("sender111");
      expect(result!.actionMetadata.to).to.equal("receiver222");
      expect(result!.actionMetadata.amount).to.equal(1);
    });

    it("handles multiple receivers from one sender via inner instructions", async () => {
      // accounts: [0]=fanout, [1]=treasuryAta, [2]=ataA, [3]=ataB, [4]=ataC, [5]=tokenProgram
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "fanout", signer: false, writable: true, source: "transaction" },
              { pubkey: "treasuryAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "ataA", signer: false, writable: true, source: "transaction" },
              { pubkey: "ataB", signer: false, writable: true, source: "transaction" },
              { pubkey: "ataC", signer: false, writable: true, source: "transaction" },
              { pubkey: TOKEN_PROGRAM, signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              { programId: "someProgram", accounts: [0], data: "someData" },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 0, 0, 0, 0, 0],
          postBalances: [999995000, 0, 0, 0, 0, 0],
          preTokenBalances: [
            { accountIndex: 1, mint: HNT_MINT, uiTokenAmount: { uiAmount: 100, decimals: 8, amount: "10000000000", uiAmountString: "100" }, owner: "treasuryWallet" },
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "walletA" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "walletB" },
            { accountIndex: 4, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "walletC" },
          ],
          postTokenBalances: [
            { accountIndex: 1, mint: HNT_MINT, uiTokenAmount: { uiAmount: 94, decimals: 8, amount: "9400000000", uiAmountString: "94" }, owner: "treasuryWallet" },
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 3, decimals: 8, amount: "300000000", uiAmountString: "3" }, owner: "walletA" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 2, decimals: 8, amount: "200000000", uiAmountString: "2" }, owner: "walletB" },
            { accountIndex: 4, mint: HNT_MINT, uiTokenAmount: { uiAmount: 1, decimals: 8, amount: "100000000", uiAmountString: "1" }, owner: "walletC" },
          ],
          innerInstructions: [
            {
              index: 0,
              instructions: [
                // SPL Transfer: treasuryAta(1) → ataA(2), authority=fanout(0)
                { programId: TOKEN_PROGRAM, accounts: [1, 2, 0], data: encodeSplTransfer(300000000) },
                // SPL Transfer: treasuryAta(1) → ataB(3), authority=fanout(0)
                { programId: TOKEN_PROGRAM, accounts: [1, 3, 0], data: encodeSplTransfer(200000000) },
                // SPL Transfer: treasuryAta(1) → ataC(4), authority=fanout(0)
                { programId: TOKEN_PROGRAM, accounts: [1, 4, 0], data: encodeSplTransfer(100000000) },
              ],
            },
          ],
          err: null,
          logMessages: [],
        } as any,
      });

      // Without connection, falls through to spl_transfer with first transfer
      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.from).to.equal("treasuryWallet");
      expect(result!.actionMetadata.to).to.equal("walletA");
      expect(result!.actionMetadata.amount).to.equal(3);
    });

    it("resolves inner instructions using programIdIndex (real format)", async () => {
      // Real inner instructions use programIdIndex (not programId).
      // Token program is at accountKeys index 5.
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "payer", signer: true, writable: true, source: "transaction" },
              { pubkey: "sourceAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "destAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "authority", signer: false, writable: false, source: "transaction" },
              { pubkey: "someProgram", signer: false, writable: false, source: "transaction" },
              { pubkey: TOKEN_PROGRAM, signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              { programId: "someProgram", accounts: [0], data: "abc" },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 0, 0, 0, 0, 0],
          postBalances: [999995000, 0, 0, 0, 0, 0],
          preTokenBalances: [
            { accountIndex: 1, mint: HNT_MINT, uiTokenAmount: { uiAmount: 50, decimals: 8, amount: "5000000000", uiAmountString: "50" }, owner: "senderWallet" },
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "receiverWallet" },
          ],
          postTokenBalances: [
            { accountIndex: 1, mint: HNT_MINT, uiTokenAmount: { uiAmount: 48, decimals: 8, amount: "4800000000", uiAmountString: "48" }, owner: "senderWallet" },
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 2, decimals: 8, amount: "200000000", uiAmountString: "2" }, owner: "receiverWallet" },
          ],
          innerInstructions: [
            {
              index: 0,
              instructions: [
                // programIdIndex 5 = TOKEN_PROGRAM, accounts [1,2,3] = [sourceAta, destAta, authority]
                { programIdIndex: 5, accounts: [1, 2, 3], data: encodeSplTransfer(200000000), stackHeight: 2 },
              ],
            },
          ],
          err: null,
          logMessages: [],
        } as any,
      });

      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.from).to.equal("senderWallet");
      expect(result!.actionMetadata.to).to.equal("receiverWallet");
      expect(result!.actionMetadata.amount).to.equal(2);
      expect(result!.actionMetadata.tokenName).to.equal("HNT");
    });

    it("resolves accounts from address lookup tables", async () => {
      // ATA accounts come from an address lookup table (loadedAddresses)
      // Static keys: [0]=payer, [1]=tokenProgram
      // ALT writable: [2]=sourceAta, [3]=destAta
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "payer", signer: true, writable: true, source: "transaction" },
              { pubkey: TOKEN_PROGRAM, signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              { programId: TOKEN_PROGRAM, accounts: [2, 3, 0], data: encodeSplTransfer(100000000) },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 0],
          postBalances: [999995000, 0],
          loadedAddresses: {
            writable: ["sourceAta", "destAta"],
            readonly: [],
          },
          preTokenBalances: [
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 10, decimals: 8, amount: "1000000000", uiAmountString: "10" }, owner: "sender" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "receiver" },
          ],
          postTokenBalances: [
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 9, decimals: 8, amount: "900000000", uiAmountString: "9" }, owner: "sender" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 1, decimals: 8, amount: "100000000", uiAmountString: "1" }, owner: "receiver" },
          ],
          innerInstructions: [],
          err: null,
          logMessages: [],
        } as any,
      });

      const result = await classifyTransaction(tx);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.from).to.equal("sender");
      expect(result!.actionMetadata.to).to.equal("receiver");
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
              { programId: "11111111111111111111111111111111", accounts: [0, 1], data: "3Bxs3zuFMN7Lk6MH" },
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
              { programId: "someRandomProgram111", accounts: [0], data: "deadbeef" },
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

  describe("tuktuk-wrapped rewards distribution (real Helius data)", () => {
    // These use actual raw Helius API responses as fixtures
    const lazyDistTx = require("./fixtures/lazy_distributor_distribute.json") as HeliusTransaction;
    const miniFanoutTx = require("./fixtures/mini_fanout_distribute.json") as HeliusTransaction;
    const WALLET = "4MxcR2VMnRd4V1BuxSDfzgHRpfLz1TrNFfavWhVExnKU";

    it("returns null for lazy_distributor distribute when wallet is not in token balances", async () => {
      // This tx sends to the mini fanout token account, not the wallet directly.
      // The wallet has no token balance entries, so it should be skipped entirely.
      const { Connection } = await import("@solana/web3.js");
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      );

      const result = await classifyTransaction(lazyDistTx, connection, WALLET);
      expect(result).to.be.null;
    });

    it("classifies mini_fanout distribute with 0 amount when wallet is in token balances", async () => {
      const { Connection } = await import("@solana/web3.js");
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      );

      const result = await classifyTransaction(miniFanoutTx, connection, WALLET);
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("rewards_distribution");
      expect(result!.actionMetadata.program).to.equal("mini_fanout");
      const transfers = result!.actionMetadata.transfers as any[];
      expect(transfers).to.have.length(1);
      expect(transfers[0].to).to.equal(WALLET);
      expect(transfers[0].amount).to.equal(0);
      // Mint is devnet HNT (different address from mainnet), so just check it exists
      expect(transfers[0].mint).to.be.a("string").and.not.be.empty;
    });
  });

  describe("wallet-filtered rewards detection", () => {
    it("skips rewards when wallet is not a recipient (no connection fallthrough)", async () => {
      // wallet="crankTurner" is not receiving tokens
      const tx = baseTx({
        transaction: {
          signatures: ["test-sig"],
          message: {
            accountKeys: [
              { pubkey: "crankTurner", signer: true, writable: true, source: "transaction" },
              { pubkey: "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w", signer: false, writable: false, source: "transaction" },
              { pubkey: "escrowAta", signer: false, writable: true, source: "transaction" },
              { pubkey: "recipientAta", signer: false, writable: true, source: "transaction" },
              { pubkey: TOKEN_PROGRAM, signer: false, writable: false, source: "transaction" },
            ],
            instructions: [
              { programId: "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w", accounts: [0, 2, 3], data: "someDistributeData" },
            ],
          },
        } as any,
        meta: {
          fee: 5000,
          preBalances: [1000000000, 1, 0, 0, 0],
          postBalances: [999995000, 1, 0, 0, 0],
          preTokenBalances: [
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 100, decimals: 8, amount: "10000000000", uiAmountString: "100" }, owner: "escrow" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 0, decimals: 8, amount: "0", uiAmountString: "0" }, owner: "someoneElse" },
          ],
          postTokenBalances: [
            { accountIndex: 2, mint: HNT_MINT, uiTokenAmount: { uiAmount: 95, decimals: 8, amount: "9500000000", uiAmountString: "95" }, owner: "escrow" },
            { accountIndex: 3, mint: HNT_MINT, uiTokenAmount: { uiAmount: 5, decimals: 8, amount: "500000000", uiAmountString: "5" }, owner: "someoneElse" },
          ],
          innerInstructions: [
            {
              index: 0,
              instructions: [
                { programId: TOKEN_PROGRAM, accounts: [2, 3, 0], data: encodeSplTransfer(500000000) },
              ],
            },
          ],
          err: null,
          logMessages: [],
        } as any,
      });

      // Without connection, can't decode lazy_distributor IDL, falls through to spl_transfer
      const result = await classifyTransaction(tx, undefined, "crankTurner");
      expect(result).to.not.be.null;
      expect(result!.actionType).to.equal("spl_transfer");
      expect(result!.actionMetadata.to).to.equal("someoneElse");
    });
  });
});
