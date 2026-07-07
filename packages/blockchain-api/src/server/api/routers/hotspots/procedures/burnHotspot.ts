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
  createBurnInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { entityCreatorKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { buildActionProposal, vaultPda } from "../../squads/procedures/helpers";

const DAO_KEY = daoKey(HNT_MINT)[0];

async function getBubblegumAuthorityPDA(
  merkleRollPubKey: PublicKey
): Promise<PublicKey> {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
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
 * Create a transaction to permanently burn (destroy) a hotspot cNFT. Mirrors
 * transferHotspot's bubblegum + Merkle-proof wiring, using the burn
 * instruction instead of transfer.
 */
export const burnHotspot = publicProcedure.hotspots.burnHotspot.handler(
  async ({ input, errors }) => {
    const { walletAddress, hotspotPubkey } = input;

    const assetId = await getAssetIdFromPubkey(hotspotPubkey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    let payerPubkey: PublicKey;
    try {
      payerPubkey = new PublicKey(walletAddress);
    } catch {
      throw errors.BAD_REQUEST({ message: "Invalid public key format" });
    }

    const connection = new Connection(env.SOLANA_RPC_URL);
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;

    const { asset, args, accounts, remainingAccounts } =
      await proofArgsAndAccounts({
        connection,
        assetId: new PublicKey(assetId),
        assetEndpoint,
      });

    if (!asset) {
      throw errors.NOT_FOUND({ message: "Asset not found" });
    }
    if (!validateHeliumHotspot(asset)) {
      throw errors.BAD_REQUEST({
        message: "Asset is not a valid Helium hotspot",
      });
    }

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

    // Refuse to burn a hotspot with an active reward contract, matching the
    // transfer guard — burning it would orphan the contract.
    if (await hasRewardContract(hotspotPubkey)) {
      throw errors.CONFLICT({
        message:
          "Cannot burn hotspot with active reward contract. Delete the contract first.",
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

    const hotspotName = asset.content?.metadata?.name || "Hotspot";

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
          insufficientFunds: ({ required, available }) =>
            errors.INSUFFICIENT_FUNDS({
              message: "Insufficient SOL balance to create the burn proposal",
              data: { required, available },
            }),
          notFound: () =>
            errors.NOT_FOUND({
              message: `Multisig ${input.multisig} not found`,
            }),
        });

      return {
        transactionData: {
          transactions: [
            {
              serializedTransaction,
              metadata: {
                type: "hotspot_burn_proposal",
                description: `Propose burn of ${hotspotName}`,
                hotspotKey: assetId,
                hotspotName,
              },
            },
          ],
          parallel: false,
          tag: generateTransactionTag({
            type: TRANSACTION_TYPES.HOTSPOT_BURN,
            walletAddress,
            assetId,
            multisig: input.multisig,
          }),
          actionMetadata: {
            type: "hotspot_burn_proposal",
            multisig: input.multisig,
            transactionIndex,
            hotspotKey: assetId,
            hotspotName,
          },
        },
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

    const txFee = getTransactionFee(tx);

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
