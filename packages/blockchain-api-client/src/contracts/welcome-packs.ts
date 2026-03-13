import { BAD_REQUEST, CONFLICT, INVALID_WALLET_ADDRESS, NOT_FOUND } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import {
  WelcomePackListInputSchema,
  WelcomePackListOutputSchema,
  WelcomePackCreateInputSchema,
  WelcomePackCreateOutputSchema,
  WelcomePackGetInputSchema,
  WelcomePackSchema,
  WelcomePackDeleteInputSchema,
  WelcomePackDeleteOutputSchema,
  WelcomePackGetByAddressInputSchema,
  WelcomePackClaimInputSchema,
  WelcomePackClaimOutputSchema,
  WelcomePackInviteInputSchema,
  WelcomePackInviteOutputSchema,
} from "../schemas/welcome-packs";
import { oc } from "@orpc/contract";

export const welcomePacksContract = oc
  .tag("Welcome Packs")
  .router({
    /** Public: List welcome packs for a wallet */
    list: oc
      .route({ method: "GET", path: "/welcome-packs/{walletAddress}", summary: "List welcome packs for a wallet" })
      .input(WelcomePackListInputSchema)
      .output(WelcomePackListOutputSchema)
      .errors({
        INVALID_WALLET_ADDRESS
      }),

    /** Protected: Create a new welcome pack */
    create: oc
      .route({ method: "POST", path: "/welcome-packs", summary: "Create a new welcome pack" })
      .input(WelcomePackCreateInputSchema)
      .output(WelcomePackCreateOutputSchema)
      .errors({
        BAD_REQUEST,
        CONFLICT,
        INSUFFICIENT_FUNDS,
      }),

    /** Public: Get a specific welcome pack */
    get: oc
      .route({ method: "GET", path: "/welcome-packs/{walletAddress}/{packId}", summary: "Get a specific welcome pack" })
      .input(WelcomePackGetInputSchema)
      .output(WelcomePackSchema)
      .errors({
        NOT_FOUND,
        INVALID_WALLET_ADDRESS
      }),

    /** Protected: Delete a welcome pack */
    delete: oc
      .route({ method: "DELETE", path: "/welcome-packs/{walletAddress}/{packId}", summary: "Delete a welcome pack" })
      .input(WelcomePackDeleteInputSchema)
      .output(WelcomePackDeleteOutputSchema)
      .errors({
        BAD_REQUEST,
        INVALID_WALLET_ADDRESS,
        INSUFFICIENT_FUNDS,
      }),

    /** Public: Get welcome pack by pack address */
    getByAddress: oc
      .route({ method: "GET", path: "/welcome-packs/address/{packAddress}", summary: "Get welcome pack by pack address" })
      .input(WelcomePackGetByAddressInputSchema)
      .output(WelcomePackSchema)
      .errors({
        NOT_FOUND,
      }),

    /** Public: Claim a welcome pack (no auth needed, uses claim token) */
    claim: oc
      .route({ method: "POST", path: "/welcome-packs/claim", summary: "Claim a welcome pack" })
      .input(WelcomePackClaimInputSchema)
      .output(WelcomePackClaimOutputSchema)
      .errors({
        BAD_REQUEST,
        EXPIRED: { message: "Claim link has expired", status: 410 },
      }),

    /** Protected: Send an invite for a welcome pack */
    invite: oc
      .route({ method: "POST", path: "/welcome-packs/invite", summary: "Send an invite for a welcome pack" })
      .input(WelcomePackInviteInputSchema)
      .output(WelcomePackInviteOutputSchema)
      .errors({
        BAD_REQUEST,
        NOT_FOUND,
      }),
  });
