import animalName from "angry-purple-tiger";
import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { filterHotspotsWithoutMiniFanout } from "@/lib/utils/mini-fanout-helpers";
import {
  formBulkTransactions,
  getBulkRewards,
} from "@/utils/distributorOracle";
import { PublicKey } from "@solana/web3.js";
import {
  getJitoTipAmountLamports,
  getJitoTipTransaction,
  shouldUseJitoBundle,
} from "@/lib/utils/jito";
import {
  getTotalTransactionFees,
  calculateRequiredBalance,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { getLazyDistributorForNetwork } from "@/lib/utils/network-mint";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { pendingOracleRewards } from "@/lib/utils/pending-rewards";

/**
 * Create transactions to claim the full pending rewards for a single hotspot.
 * This is the direct-claim path from `claimRewards` scoped to one asset: no
 * pagination, no Tuktuk fallback, and no partial-amount option (the oracle
 * signs for the full pending amount).
 */
export const claimHotspotRewards =
  publicProcedure.hotspots.claimHotspotRewards.handler(
    async ({ input, errors }) => {
      const { entityPubKey, walletAddress, network } = input;
      const lazyDistributor = getLazyDistributorForNetwork(network);

      const assetId = await getAssetIdFromPubkey(entityPubKey);
      if (!assetId) {
        throw errors.NOT_FOUND({ message: "Hotspot not found" });
      }
      const asset = new PublicKey(assetId);
      // For a hotspot the helium pubkey is its reward entity key.
      const entityKey = entityPubKey;

      const { provider, connection } = createSolanaConnection(walletAddress);
      const [ldProgram, mfProgram] = await Promise.all([
        initLd(provider),
        initMiniFanout(provider),
      ]);

      const [recipientPk] = recipientKey(lazyDistributor, asset);
      const [rewards, recipientAcc] = await Promise.all([
        getBulkRewards(ldProgram, lazyDistributor, [entityKey]),
        ldProgram.account.recipientV0.fetchNullable(recipientPk),
      ]);

      // Positive pending = oracle median minus what's already been distributed.
      const hasPending = pendingOracleRewards(
        rewards,
        entityKey,
        recipientAcc
      ).gtn(0);

      const emptyResponse = async () => ({
        transactionData: {
          transactions: [],
          parallel: false,
          tag: `claim_hotspot_rewards:${walletAddress}:${entityKey}:empty`,
          actionMetadata: {
            type: "claim_rewards",
            hotspotKey: entityKey,
            hotspotName: animalName(entityKey),
            network,
          },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(0),
          NATIVE_MINT.toBase58()
        ),
      });

      if (!hasPending) {
        return emptyResponse();
      }

      // Hotspots routed through a mini fanout are claimed via the fanout, not a
      // direct claim, so exclude them.
      const { claimable } = await filterHotspotsWithoutMiniFanout(
        ldProgram,
        mfProgram,
        connection,
        lazyDistributor,
        [{ asset, entityKey }]
      );
      if (claimable.length === 0) {
        return emptyResponse();
      }

      const vtxs = await formBulkTransactions({
        program: ldProgram,
        rewards,
        assets: [asset],
        lazyDistributor,
        assetEndpoint: env.ASSET_ENDPOINT,
        isDevnet: getCluster() === "devnet",
        useCache: false,
        skipOracleSign: false,
      });

      const useJito = shouldUseJitoBundle(vtxs.length, getCluster());
      if (useJito) {
        vtxs.push(await getJitoTipTransaction(new PublicKey(walletAddress)));
      }

      const txFees = await getTotalTransactionFees(connection, vtxs);
      const jitoTipCost = useJito ? getJitoTipAmountLamports() : 0;
      const rentCost = recipientAcc ? 0 : RENT_COSTS.RECIPIENT;
      const requiredLamports = calculateRequiredBalance(
        txFees + jitoTipCost,
        rentCost
      );
      const senderBalance = await connection.getBalance(
        new PublicKey(walletAddress)
      );
      if (senderBalance < requiredLamports) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to claim rewards",
          data: { available: senderBalance, required: requiredLamports },
        });
      }

      const transactions = vtxs.map((tx) => ({
        serializedTransaction: Buffer.from(tx.serialize()).toString("base64"),
        metadata: {
          type: "claim_rewards",
          description: "Claim hotspot rewards",
        },
      }));

      return {
        transactionData: {
          transactions,
          // Sequential: a recipient's init and distribute ixs may land in
          // different packed txs; parallel submission races them.
          parallel: false,
          tag: `claim_hotspot_rewards:${walletAddress}:${entityKey}`,
          actionMetadata: {
            type: "claim_rewards",
            hotspotKey: entityKey,
            hotspotName: animalName(entityKey),
            network,
          },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(txFees + rentCost),
          NATIVE_MINT.toBase58()
        ),
      };
    }
  );
