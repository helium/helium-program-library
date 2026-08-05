import { publicProcedure } from "../../../procedures";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { createBurnInstruction } from "@metaplex-foundation/mpl-bubblegum";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  buildActionProposal,
  proposalTransactionData,
} from "../../squads/procedures/helpers";
import { resolveOwnedHotspotCnft } from "./hotspot-cnft";

/**
 * Create a transaction to permanently burn (destroy) a hotspot cNFT, using the
 * bubblegum + Merkle-proof wiring with the burn instruction.
 */
export const burnHotspot = publicProcedure.hotspots.burnHotspot.handler(
  async ({ input, errors }) => {
    const { walletAddress, hotspotPubkey } = input;

    const {
      connection,
      payerPubkey,
      multisigPda,
      assetId,
      args,
      remainingAccounts,
      merkleTree,
      treeAuthority,
      leafOwner,
      leafDelegate,
      hotspotName,
    } = await resolveOwnedHotspotCnft({
      walletAddress,
      hotspotPubkey,
      multisig: input.multisig,
      conflictMessage:
        "Cannot burn hotspot with active reward contract. Delete the contract first.",
      errors,
    });

    const burnInstruction = createBurnInstruction(
      {
        treeAuthority,
        leafOwner,
        leafDelegate,
        merkleTree,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        anchorRemainingAccounts: remainingAccounts,
      },
      {
        ...args,
        nonce: args.index,
      }
    );

    // ---- Squads propose mode ----
    // UNVERIFIED: this path cannot be exercised on a mainnet fork. The proof and
    // ownership come from the real DAS index, so the vault must actually own the
    // hotspot on-chain — a fork-created vault never does, and surfpool can't set
    // cNFT ownership. Verify against a live multisig vault that owns a test
    // hotspot before relying on this in production.
    if (multisigPda) {
      const { serializedTransaction, transactionIndex, feeLamports } =
        await buildActionProposal({
          connection,
          multisigPda,
          member: payerPubkey,
          memo: input.memo,
          buildInstructions: () => [burnInstruction],
          errors,
          action: "burn",
        });

      return {
        transactionData: proposalTransactionData({
          serializedTransaction,
          type: TRANSACTION_TYPES.HOTSPOT_BURN_PROPOSAL,
          description: `Propose burn of ${hotspotName}`,
          tag: generateTransactionTag({
            type: TRANSACTION_TYPES.HOTSPOT_BURN,
            walletAddress,
            assetId,
            multisig: input.multisig,
          }),
          multisig: multisigPda.toBase58(),
          transactionIndex,
          metadata: { hotspotKey: assetId, hotspotName },
        }),
        estimatedSolFee: await toTokenAmountOutput(
          new BN(feeLamports),
          NATIVE_MINT.toBase58()
        ),
      };
    }

    // ---- Direct burn from the wallet ----
    const walletBalance = await connection.getBalance(payerPubkey);
    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required, available: walletBalance },
      });
    }

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions: [burnInstruction], feePayer: payerPubkey },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.HOTSPOT_BURN,
      walletAddress,
      assetId,
      timestamp: Date.now(),
    });

    const txFee = await getTransactionFee(connection, tx);

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: TRANSACTION_TYPES.HOTSPOT_BURN,
              description: `Burn ${hotspotName}`,
              hotspotKey: assetId,
              hotspotName,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: TRANSACTION_TYPES.HOTSPOT_BURN,
          hotspotKey: assetId,
          hotspotName,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
