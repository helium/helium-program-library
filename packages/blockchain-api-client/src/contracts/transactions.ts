import { oc } from "@orpc/contract";
import {
  SubmitInputSchema,
  SubmitOutputSchema,
  GetInputSchema,
  BatchStatusOutputSchema,
  ResubmitInputSchema,
  ResubmitOutputSchema,
  GetByPayerInputSchema,
  PayerBatchesOutputSchema,
  GetByPayerAndTagInputSchema,
  EstimateInputSchema,
  EstimateOutputSchema,
  GetHistoryInputSchema,
  HistoryOutputSchema,
} from "../schemas/transactions";
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from "../errors/common";
import { SIMULATION_FAILED } from "../errors/solana";

export const transactionsContract = oc
  .tag("Transactions")
  .router({
    submit: oc
      .route({ method: "POST", path: "/transactions", summary: "Submit a transaction" })
      .input(SubmitInputSchema)
      .output(SubmitOutputSchema)
      .errors({
        BAD_REQUEST,
        CONFLICT,
        SIMULATION_FAILED
      }),
    get: oc
      .route({ method: "GET", path: "/transactions/{id}", summary: "Get transaction status" })
      .input(GetInputSchema)
      .output(BatchStatusOutputSchema)
      .errors({
        NOT_FOUND,
      }),
    resubmit: oc
      .route({ method: "POST", path: "/transactions/{id}/resubmit", summary: "Resubmit a transaction" })
      .input(ResubmitInputSchema)
      .output(ResubmitOutputSchema)
      .errors({
        NOT_FOUND,
        BAD_REQUEST,
      }),
    getByPayer: oc
      .route({ method: "GET", path: "/transactions/payer/{payer}", summary: "Get transactions by payer" })
      .input(GetByPayerInputSchema)
      .output(PayerBatchesOutputSchema)
      .errors({
        BAD_REQUEST
      }),
    getByPayerAndTag: oc
      .route({ method: "GET", path: "/transactions/payer/{payer}/tag/{tag}", summary: "Get transactions by payer and tag" })
      .input(GetByPayerAndTagInputSchema)
      .output(PayerBatchesOutputSchema)
      .errors({
        BAD_REQUEST
      }),
    estimate: oc
      .route({ method: "POST", path: "/transactions/estimate", summary: "Estimate transaction costs" })
      .input(EstimateInputSchema)
      .output(EstimateOutputSchema)
      .errors({
        BAD_REQUEST,
        SIMULATION_FAILED
      }),
    history: oc
      .route({ method: "GET", path: "/transactions/history/{payer}", summary: "Get unified transaction history" })
      .input(GetHistoryInputSchema)
      .output(HistoryOutputSchema)
      .errors({
        BAD_REQUEST,
      }),
  });