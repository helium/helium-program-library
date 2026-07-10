import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
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
import { createTransferInstruction } from "@metaplex-foundation/mpl-bubblegum";
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
 * Create a transaction to transfer a hotspot to a new owner.
 */
export const transferHotspot = publicProcedure.hotspots.transferHotspot.handler(
  async ({ input, errors }) => {
    const { walletAddress, hotspotPubkey, recipient } = input;

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
        "Cannot transfer hotspot with active reward contract. Delete the contract first.",
      errors,
    });

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      throw errors.BAD_REQUEST({ message: "Invalid public key format" });
    }

    const transferInstruction = createTransferInstruction(
      {
        treeAuthority,
        leafOwner,
        leafDelegate,
        newLeafOwner: recipientPubkey,
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

    const shortRecipient = `${recipient.slice(0, 4)}...${recipient.slice(-4)}`;

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
          buildInstructions: () => [transferInstruction],
          errors,
          action: "transfer",
        });

      return {
        transactionData: proposalTransactionData({
          serializedTransaction,
          type: TRANSACTION_TYPES.HOTSPOT_TRANSFER_PROPOSAL,
          description: `Propose transfer of ${hotspotName} to ${shortRecipient}`,
          tag: generateTransactionTag({
            type: TRANSACTION_TYPES.HOTSPOT_TRANSFER,
            walletAddress,
            assetId,
            recipient,
            multisig: input.multisig,
          }),
          multisig: multisigPda.toBase58(),
          transactionIndex,
          metadata: { hotspotKey: assetId, hotspotName, recipient },
        }),
        estimatedSolFee: await toTokenAmountOutput(
          new BN(feeLamports),
          NATIVE_MINT.toBase58()
        ),
      };
    }

    // ---- Direct transfer from the wallet ----
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
      draft: {
        instructions: [transferInstruction],
        feePayer: payerPubkey,
      },
    });

    const serializedTransaction = serializeTransaction(tx);
    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.HOTSPOT_TRANSFER,
      walletAddress,
      assetId,
      recipient,
      timestamp: Date.now(),
    });

    const txFee = getTransactionFee(tx);

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction,
            metadata: {
              type: TRANSACTION_TYPES.HOTSPOT_TRANSFER,
              description: `Transfer ${hotspotName} to ${shortRecipient}`,
              hotspotKey: assetId,
              hotspotName,
              recipient,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: TRANSACTION_TYPES.HOTSPOT_TRANSFER,
          hotspotKey: assetId,
          hotspotName,
          recipient,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
