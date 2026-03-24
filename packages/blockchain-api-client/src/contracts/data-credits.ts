import { oc } from "@orpc/contract";
import { MintDataCreditsInputSchema } from "../schemas/data-credits";
import { TransactionDataSchema } from "../schemas/common";
import { BAD_REQUEST } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";

export const dataCreditsContract = oc.tag("Data Credits").router({
  mint: oc
    .route({
      method: "POST",
      path: "/data-credits/mint",
      summary: "Mint data credits by burning HNT",
    })
    .input(MintDataCreditsInputSchema)
    .output(TransactionDataSchema)
    .errors({
      BAD_REQUEST,
      INSUFFICIENT_FUNDS,
    }),
});
