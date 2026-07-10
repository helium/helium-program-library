import { publicProcedure } from "../../../procedures";
import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "@/lib/env";
import { hasRewardContract } from "@/lib/queries/hotspots";
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
import { proofArgsAndAccounts } from "@helium/spl-utils";
import { createTransferInstruction } from "@metaplex-foundation/mpl-bubblegum";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  getAssetIdFromPubkey,
  getBubblegumAuthorityPDA,
  validateHeliumHotspot,
} from "@/lib/utils/hotspot-helpers";
import {
  buildActionProposal,
  proposalTransactionData,
  vaultPda,
} from "../../squads/procedures/helpers";

/**
 * Create a transaction to transfer a hotspot to a new owner.
 */
export const transferHotspot = publicProcedure.hotspots.transferHotspot.handler(
  async ({ input, errors }) => {
    const { walletAddress, hotspotPubkey, recipient } = input;

    // Resolve hotspot pubkey to asset ID
    const assetId = await getAssetIdFromPubkey(hotspotPubkey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    // Validate public keys
    let payerPubkey: PublicKey;
    let recipientPubkey: PublicKey;

    try {
      payerPubkey = new PublicKey(walletAddress);
      recipientPubkey = new PublicKey(recipient);
    } catch {
      throw errors.BAD_REQUEST({ message: "Invalid public key format" });
    }

    const connection = new Connection(env.SOLANA_RPC_URL);
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
    const assetPubkey = new PublicKey(assetId);

    const { asset, args, accounts, remainingAccounts } =
      await proofArgsAndAccounts({
        connection,
        assetId: assetPubkey,
        assetEndpoint,
      });

    if (!asset) {
      throw errors.NOT_FOUND({ message: "Asset not found" });
    }

    // Validate asset is a Helium hotspot
    if (!validateHeliumHotspot(asset)) {
      throw errors.BAD_REQUEST({
        message: "Asset is not a valid Helium hotspot",
      });
    }

    // Validate ownership
    const ownerAddress =
      typeof asset.ownership.owner === "string"
        ? asset.ownership.owner
        : asset.ownership.owner.toBase58();

    // In Squads propose mode the on-chain owner must be the multisig's vault
    // (walletAddress is only the proposing member); otherwise the wallet itself.
    const multisigPda = input.multisig
      ? new PublicKey(input.multisig)
      : undefined;
    const expectedOwner = multisigPda ? vaultPda(multisigPda) : payerPubkey;
    if (ownerAddress !== expectedOwner.toBase58()) {
      throw errors.UNAUTHORIZED({
        message: multisigPda
          ? "Multisig vault is not the owner of this hotspot"
          : "Wallet is not the owner of this hotspot",
      });
    }

    // Check if a contract exists for this hotspot
    const contractExists = await hasRewardContract(hotspotPubkey);
    if (contractExists) {
      throw errors.CONFLICT({
        message:
          "Cannot transfer hotspot with active reward contract. Delete the contract first.",
      });
    }

    const leafOwner = new PublicKey(ownerAddress);
    const leafDelegate = asset.ownership.delegate
      ? typeof asset.ownership.delegate === "string"
        ? new PublicKey(asset.ownership.delegate)
        : asset.ownership.delegate
      : leafOwner;

    const merkleTree = accounts.merkleTree;
    const treeAuthority = await getBubblegumAuthorityPDA(merkleTree);

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
      },
    );

    const hotspotName = asset.content?.metadata?.name || "Hotspot";
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
          insufficientFunds: ({ required, available }) =>
            errors.INSUFFICIENT_FUNDS({
              message:
                "Insufficient SOL balance to create the transfer proposal",
              data: { required, available },
            }),
          notFound: () =>
            errors.NOT_FOUND({
              message: `Multisig ${input.multisig} not found`,
            }),
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
          actionMetadata: { hotspotKey: assetId, hotspotName, recipient },
        }),
        estimatedSolFee: await toTokenAmountOutput(
          new BN(feeLamports),
          NATIVE_MINT.toBase58(),
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
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
