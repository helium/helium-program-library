import { z } from "zod";
import { BAD_REQUEST, CONFLICT, NOT_FOUND, UNAUTHORIZED } from "../errors/common";
import {
    FindRewardContractResponseSchema,
    CreateRewardContractTransactionInputSchema,
    CreateRewardContractTransactionResponseSchema,
    DeleteRewardContractTransactionResponseSchema,
    CreateInviteResponseSchema,
    ClaimInviteRequestSchema,
    ClaimInviteResponseSchema,
    EstimateCostToCreateRewardContractResponseSchema
} from "../schemas/reward-contract";
import { HeliumPublicKeySchema, WalletAddressSchema } from "../schemas/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import { oc } from "@orpc/contract";


export const rewardContract = oc
    .tag("Reward Contract")
    .prefix("/hotspots")
    .router({
        find: oc
            .route({
                method: "GET",
                path: "/{entityPubKey}/reward-contract",
                summary: "Get Contract",
                description: "Retrieves the reward contract (pending or active) associated with a specific hotspot entity.",
            })
            .input(z.object({
                entityPubKey: HeliumPublicKeySchema
            }))
            .errors({
                NOT_FOUND,
                BAD_REQUEST,
            })
            .output(FindRewardContractResponseSchema),
        estimateCreationCost: oc
            .route({
                method: "GET",
                path: "/{entityPubKey}/reward-contract/estimate-creation-cost",
                summary: "Estimate Creation Cost",
                description: "Estimates the cost to create a reward contract for a specific hotspot entity.",
            })
            .input(CreateRewardContractTransactionInputSchema.extend({
                entityPubKey: HeliumPublicKeySchema.describe("The public key of the hotspot entity"),
            }))
            .output(EstimateCostToCreateRewardContractResponseSchema)
            .errors({
                BAD_REQUEST,
                NOT_FOUND,
            }),
        create: oc
            .route({
                method: "POST",
                path: "/{entityPubKey}/reward-contract",
                summary: "Create Reward Contract",
                description: "Assembles an unsigned transaction to create a claimable or finalized reward contract for a specific hotspot entity. If the input inlcudes a pending/claimable recipient, the contract will be created as a pending/claimable contract. If the input is defined exclusively with preset recipients, an active contract will be created directly.",
            })
            .input(
                CreateRewardContractTransactionInputSchema.extend({
                    entityPubKey: HeliumPublicKeySchema.describe("The public key of the hotspot entity"),
                    signerWalletAddress: WalletAddressSchema.describe("The wallet address of the caller"),
                }),
            )
            .errors({
                BAD_REQUEST,
                CONFLICT,
                NOT_FOUND,
                UNAUTHORIZED,
                // Does this belong here to guard gifted currency check?
                INSUFFICIENT_FUNDS
            })
            .output(CreateRewardContractTransactionResponseSchema),
        delete: oc
            .route({
                method: "DELETE",
                path: "/{entityPubKey}/reward-contract",
                summary: "Delete Pending Contract",
                description: "Assembles an unsigned transaction to delete a reward contract (pending or active) for a specific hotspot entity.",
            })
            .input(
                z.object({
                    entityPubKey: HeliumPublicKeySchema.describe("The public key of the hotspot entity"),
                    signerWalletAddress: WalletAddressSchema.describe("The wallet address of the caller"),
                })
            )
            .errors({
                BAD_REQUEST,
                NOT_FOUND,
                // if wallet is not the delegate
                UNAUTHORIZED,
                INSUFFICIENT_FUNDS,
            })
            .output(DeleteRewardContractTransactionResponseSchema),

        invite: oc
            .route({
                method: "POST",
                path: "/{entityPubKey}/reward-contract/invite",
                summary: "Create Invite",
                description: "Assembles details required to create a shareable invite to claim a pending reward contract.",
            })
            .input(
                z.object({
                    entityPubKey: HeliumPublicKeySchema.describe("The public key of the hotspot entity"),
                    signerWalletAddress: WalletAddressSchema.describe("The wallet address of the caller"),
                    expirationDays: z.number().int().positive().max(365).default(7).describe("Number of days until the invite expires"),
                })
            )
            .errors({
                // if no hotspot or contract found
                NOT_FOUND,
                // if the contract is not pending
                BAD_REQUEST,
                // if wallet is not the delegate
                UNAUTHORIZED,
            })
            .output(CreateInviteResponseSchema),
        claim: oc
            .route({
                method: "POST",
                path: "/{entityPubKey}/reward-contract/claim",
                summary: "Claim Invite",
                description: "Assembles an unsigned transaction which can be used to claim an invite.",
            })
            .input(
                ClaimInviteRequestSchema.extend({
                    entityPubKey: HeliumPublicKeySchema.describe("The public key of the hotspot entity"),
                    signerWalletAddress: WalletAddressSchema.describe("The wallet address of the caller"),
                }),
            )
            .errors({
                // if no hotspot or contract found
                NOT_FOUND,
                // if the contract is not pending
                BAD_REQUEST,
                // if wallet is not the delegate
                UNAUTHORIZED,
            })
            .output(ClaimInviteResponseSchema),
    });
