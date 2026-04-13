import {
  InitKycInputSchema,
  KycStatusOutputSchema,
  FeesOutputSchema,
  CreateBankAccountInputSchema,
  BankAccountSchema,
  BankAccountListOutputSchema,
  DeleteBankAccountInputSchema,
  DeleteBankAccountOutputSchema,
  GetSendQuoteInputSchema,
  QuoteOutputSchema,
  SendFundsInputSchema,
  SendFundsOutputSchema,
  UpdateTransferInputSchema,
  UpdateTransferOutputSchema,
} from "../schemas/fiat";
import { BAD_REQUEST, NOT_FOUND, RATE_LIMITED, UNAUTHENTICATED, UNAUTHORIZED } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import { oc } from "@orpc/contract";

export const fiatContract = oc
  .errors({
    UNAUTHENTICATED,
    UNAUTHORIZED,
  })
  .tag("Fiat")
  .router({
    getKycStatus: oc
      .route({ method: "GET", path: "/fiat/kyc/status" })
      .output(KycStatusOutputSchema)
      .errors({
        EMAIL_NOT_LINKED: { status: 401, message: "Email not linked." }
      }),
    initKyc: oc
      .route({ method: "POST", path: "/fiat/kyc/init" })
      .input(InitKycInputSchema)
      .output(KycStatusOutputSchema)
      .errors({
        EMAIL_NOT_LINKED: { status: 401, message: "Email not linked." },
        BRIDGE_ERROR: { message: "Failed to create Bridge KYC link", status: 500 },
      }),
    getFees: oc
      .route({ method: "GET", path: "/fiat/fees" })
      .output(FeesOutputSchema)
      .errors({}),
    listBankAccounts: oc
      .route({ method: "GET", path: "/fiat/bank-accounts" })
      .output(BankAccountListOutputSchema)
      .errors({
        NOT_FOUND: { message: "Bridge customer ID not found", status: 404 },
      }),
    createBankAccount: oc
      .route({ method: "POST", path: "/fiat/bank-accounts" })
      .input(CreateBankAccountInputSchema)
      .output(BankAccountSchema)
      .errors({
        NO_CUSTOMER: { message: "Bridge customer ID not found", status: 404 },
        BRIDGE_ERROR: { message: "Failed to create Bridge KYC link", status: 500 },
      }),
    deleteBankAccount: oc
      .route({ method: "DELETE", path: "/fiat/bank-accounts/{id}" })
      .input(DeleteBankAccountInputSchema)
      .output(DeleteBankAccountOutputSchema)
      .errors({
        NO_CUSTOMER: { message: "Bridge customer ID not found", status: 404 },
        BRIDGE_ERROR: { message: "Failed to delete bank account", status: 500 },
      }),
    getSendQuote: oc
      .route({ method: "GET", path: "/fiat/quote/{id}" })
      .input(GetSendQuoteInputSchema)
      .output(QuoteOutputSchema)
      .errors({
        BAD_REQUEST,
        JUPITER_ERROR: { message: "Failed to get quote from Jupiter", status: 500 },
        RATE_LIMITED,
      }),
    sendFunds: oc
      .route({ method: "POST", path: "/fiat/send" })
      .input(SendFundsInputSchema)
      .output(SendFundsOutputSchema)
      .errors({
        NOT_FOUND,
        BRIDGE_ERROR: { message: "Failed to create Bridge transfer", status: 500 },
        JUPITER_ERROR: { message: "Failed to get quote from Jupiter", status: 500 },
        INSUFFICIENT_FUNDS,
        RATE_LIMITED,
      }),
    updateTransfer: oc
      .route({ method: "PUT", path: "/fiat/transfer/{id}" })
      .input(UpdateTransferInputSchema)
      .output(UpdateTransferOutputSchema)
      .errors({
        NOT_FOUND: { message: "Transfer not found", status: 404 },
      }),
  });
