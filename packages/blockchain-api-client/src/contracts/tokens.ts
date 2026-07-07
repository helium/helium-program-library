import {
  BAD_REQUEST,
  INVALID_WALLET_ADDRESS,
  NOT_FOUND,
} from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import {
  GetBalancesInputSchema,
  TokenBalanceDataSchema,
  TransferInputSchema,
  TransferOutputSchema,
  MultiTransferInputSchema,
  MultiTransferOutputSchema,
  BurnInputSchema,
  BurnOutputSchema,
  MemoInputSchema,
  MemoOutputSchema,
  CreateHntAccountInputSchema,
  CreateHntAccountOutputSchema,
} from "../schemas/tokens";
import { oc } from "@orpc/contract";

export const tokensContract = oc.tag("Tokens").router({
  /** Public: Get token balances for a wallet */
  getBalances: oc
    .route({
      method: "GET",
      path: "/tokens/{walletAddress}",
      summary: "Get token balances for a wallet",
    })
    .input(GetBalancesInputSchema)
    .output(TokenBalanceDataSchema)
    .errors({
      INVALID_WALLET_ADDRESS,
    }),

  /** Protected: Transfer tokens */
  transfer: oc
    .route({
      method: "POST",
      path: "/tokens/transfer",
      summary: "Transfer tokens",
    })
    .input(TransferInputSchema)
    .output(TransferOutputSchema)
    .errors({
      BAD_REQUEST,
      INSUFFICIENT_FUNDS,
      NOT_FOUND,
    }),

  /** Protected: Transfer the same token mint to multiple recipients, packed into as few txs as possible */
  multiTransfer: oc
    .route({
      method: "POST",
      path: "/tokens/multi-transfer",
      summary: "Transfer the same token to multiple recipients",
    })
    .input(MultiTransferInputSchema)
    .output(MultiTransferOutputSchema)
    .errors({
      BAD_REQUEST,
      INSUFFICIENT_FUNDS,
    }),

  /** Protected: Burn tokens */
  burn: oc
    .route({ method: "POST", path: "/tokens/burn", summary: "Burn tokens" })
    .input(BurnInputSchema)
    .output(BurnOutputSchema)
    .errors({
      BAD_REQUEST,
      INSUFFICIENT_FUNDS,
      NOT_FOUND,
    }),

  /** Protected: Emit a memo transaction */
  memo: oc
    .route({
      method: "POST",
      path: "/tokens/memo",
      summary: "Emit a memo transaction",
    })
    .input(MemoInputSchema)
    .output(MemoOutputSchema)
    .errors({
      BAD_REQUEST,
      INSUFFICIENT_FUNDS,
    }),

  /** Protected: Create HNT account */
  createHntAccount: oc
    .route({
      method: "POST",
      path: "/tokens/hnt-account",
      summary: "Create HNT account",
    })
    .input(CreateHntAccountInputSchema)
    .output(CreateHntAccountOutputSchema)
    .errors({
      INVALID_WALLET_ADDRESS,
      INSUFFICIENT_FUNDS,
    }),
});
