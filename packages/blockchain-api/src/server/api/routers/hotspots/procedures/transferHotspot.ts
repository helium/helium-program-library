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
import { proofArgsAndAccounts, type Asset, HNT_MINT } from "@helium/spl-utils";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createTransferInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { entityCreatorKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";

const DAO_KEY = daoKey(HNT_MINT)[0];

async function getBubblegumAuthorityPDA(
  merkleRollPubKey: PublicKey,
): Promise<PublicKey> {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID,
  );
  return bubblegumAuthorityPDAKey;
}

function validateHeliumHotspot(asset: Asset): boolean {
  const heliumEntityCreator = entityCreatorKey(DAO_KEY)[0].toBase58();

  return (
    asset.creators?.some((creator) => {
      const address =
        typeof creator.address === "string"
          ? creator.address
          : creator.address.toBase58();
      return address === heliumEntityCreator && creator.verified;
    }) || false
  );
}

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

    if (ownerAddress !== walletAddress) {
      throw errors.UNAUTHORIZED({
        message: "Wallet is not the owner of this hotspot",
      });
    }

    // Check wallet has sufficient balance for transaction fees
    const walletBalance = await connection.getBalance(payerPubkey);
    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required, available: walletBalance },
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

    const leafOwner =
      typeof asset.ownership.owner === "string"
        ? new PublicKey(asset.ownership.owner)
        : asset.ownership.owner;

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

    const hotspotName = asset.content?.metadata?.name || "Hotspot";
    const txFee = getTransactionFee(tx);

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction,
            metadata: {
              type: TRANSACTION_TYPES.HOTSPOT_TRANSFER,
              description: `Transfer ${hotspotName} to ${recipient.slice(
                0,
                4,
              )}...${recipient.slice(-4)}`,
              hotspotKey: assetId,
              hotspotName,
              recipient,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: { type: TRANSACTION_TYPES.HOTSPOT_TRANSFER, hotspotKey: assetId, hotspotName, recipient },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
