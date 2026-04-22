import { publicProcedure } from "../../../procedures";
import {
  closeSingleton,
  getMultipleAccounts,
} from "@helium/account-fetch-cache";
import { getHotspotsByOwner } from "@/lib/queries/hotspots";
import { createSolanaConnection } from "@/lib/solana";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { getBulkRewards } from "@/utils/distributorOracle";
import type { BulkRewards } from "@helium/distributor-oracle";
import { entityCronAuthorityKey } from "@helium/hpl-crons-sdk";
import { cronJobKey, init as initCron } from "@helium/cron-sdk";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { truthy } from "@helium/spl-utils";
import type { TokenAmountOutput } from "@helium/blockchain-api/schemas/common";
import { unpackAccount } from "@solana/spl-token";
import {
  getMintForNetwork,
  getLazyDistributorForNetwork,
} from "@/lib/utils/network-mint";

interface MiniFanoutShare {
  wallet: PublicKey;
  delegate: PublicKey;
  share: {
    fixed?: { amount: BN };
    share?: { amount: number };
  };
}

async function zeroPending(mintAddress: string): Promise<{
  total: TokenAmountOutput;
  claimable: TokenAmountOutput;
  automated: TokenAmountOutput;
}> {
  const zero = await toTokenAmountOutput(new BN(0), mintAddress);
  return { total: zero, claimable: zero, automated: zero };
}

export const getPendingRewards =
  publicProcedure.hotspots.getPendingRewards.handler(async ({ input }) => {
    const { walletAddress, network } = input;
    const mint = getMintForNetwork(network);
    const mintAddress = mint.toBase58();
    const lazyDistributor = getLazyDistributorForNetwork(network);

    const tokenOutput = (bn: BN): Promise<TokenAmountOutput> =>
      toTokenAmountOutput(bn, mintAddress);

    const hotspotsData = await getHotspotsByOwner({
      owner: walletAddress,
      limit: 1000,
    });

    if (hotspotsData.hotspots.length === 0) {
      return { pending: await zeroPending(mintAddress), byHotspot: [] };
    }

    // Deduplicate hotspots by asset to prevent double-counting
    const seenAssets = new Set<string>();
    const uniqueHotspots = hotspotsData.hotspots.filter((h) => {
      if (seenAssets.has(h.asset)) return false;
      seenAssets.add(h.asset);
      return true;
    });

    const entityKeys = uniqueHotspots.map((h) => h.entityKey);
    const assets = uniqueHotspots.map((h) => new PublicKey(h.asset));

    const { provider, connection } = createSolanaConnection(walletAddress);
    const ldProgram = await initLd(provider);
    const cronProgram = await initCron(provider);
    const mfProgram = await initMiniFanout(provider);

    // Fetch oracle rewards, recipient accounts, cron job, and mini-fanouts in parallel
    const [oracleRewards, recipients, cronJobAccount] = await Promise.all([
      getBulkRewards(ldProgram, lazyDistributor, entityKeys),
      ldProgram.account.recipientV0.fetchMultiple(
        assets.map((asset) => recipientKey(lazyDistributor, asset)[0]),
      ),
      cronProgram.account.cronJobV0.fetchNullable(
        cronJobKey(
          entityCronAuthorityKey(new PublicKey(walletAddress))[0],
          0,
        )[0],
      ),
    ]);

    // Get unique mini fanout destinations and create a map
    const destinationToRecipientIndices = new Map<string, number[]>();
    recipients.forEach((recipient: any, idx: number) => {
      const dest = recipient?.destination?.toBase58();
      if (dest) {
        const indices = destinationToRecipientIndices.get(dest) || [];
        indices.push(idx);
        destinationToRecipientIndices.set(dest, indices);
      }
    });

    const uniqueDestinations = [...destinationToRecipientIndices.keys()];
    const miniFanoutAccounts = (
      await getMultipleAccounts(connection, uniqueDestinations, "confirmed")
    ).array;

    // Create a map from destination address to decoded mini fanout
    const destinationToMiniFanout = new Map<string, any>();
    miniFanoutAccounts.forEach((mf, idx) => {
      if (!mf) return;
      try {
        const decoded = mfProgram.coder.accounts.decode(
          "miniFanoutV0",
          mf.data,
        );
        destinationToMiniFanout.set(uniqueDestinations[idx]!, decoded);
      } catch (e) {
        // Not a mini fanout account
      }
    });

    // Create array of mini fanouts parallel to hotspots
    const miniFanouts = recipients.map((recipient: any) => {
      const dest = recipient?.destination?.toBase58();
      return dest ? destinationToMiniFanout.get(dest) || null : null;
    });

    // Fetch token account balances for mini fanouts that have claimed rewards sitting in their ATAs
    const uniqueTokenAccounts = [
      ...new Set(
        [...destinationToMiniFanout.values()]
          .map((mf) => mf.tokenAccount?.toBase58())
          .filter(truthy),
      ),
    ];
    const tokenAccountInfos =
      uniqueTokenAccounts.length > 0
        ? await connection.getMultipleAccountsInfo(
            uniqueTokenAccounts.map((ta) => new PublicKey(ta)),
          )
        : [];
    const tokenAccountBalances = new Map<string, BN>();
    tokenAccountInfos.forEach((info, idx) => {
      if (info) {
        const tokenAccount = unpackAccount(
          new PublicKey(uniqueTokenAccounts[idx]!),
          info,
        );
        tokenAccountBalances.set(
          uniqueTokenAccounts[idx]!,
          new BN(tokenAccount.amount.toString()),
        );
      }
    });

    const hasAutomation = !!cronJobAccount && !cronJobAccount.removedFromQueue;

    // Compute pending per hotspot using median oracle calculation
    const pendingPerHotspot: BN[] = entityKeys.map((entityKey, idx) => {
      const sortedOracleRewards = oracleRewards
        .map((rew: BulkRewards) => new BN(rew.currentRewards[entityKey] || "0"))
        .sort((a: BN, b: BN) => a.cmp(b));

      const oracleMedian =
        sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)] ??
        new BN(0);

      const totalRewards = recipients[idx]?.totalRewards ?? new BN(0);
      const pending = oracleMedian.sub(totalRewards);
      return pending.isNeg() ? new BN(0) : pending;
    });

    // Helper to calculate user's share from a mini fanout
    const getUserShareAmount = (miniFanout: any, grossAmount: BN): BN => {
      const shares = miniFanout.shares as MiniFanoutShare[];
      const userShare = shares.find(
        (s) =>
          s.wallet.toBase58() === walletAddress ||
          s.delegate.toBase58() === walletAddress,
      );
      if (!userShare) return new BN(0);

      if (userShare.share.fixed && !userShare.share.fixed.amount.isZero()) {
        return BN.min(grossAmount, userShare.share.fixed.amount);
      }
      const sharePercent = new BN(userShare.share.share?.amount || 0);
      return grossAmount.mul(sharePercent).div(new BN(100));
    };

    // Calculate user's share of pending oracle rewards per hotspot
    const netPendingPerHotspot: BN[] = pendingPerHotspot.map((gross, idx) => {
      const miniFanout = miniFanouts[idx];
      if (!miniFanout) return gross;
      return getUserShareAmount(miniFanout, gross);
    });

    // Calculate user's share of ATA balance per hotspot (rewards claimed but not yet distributed)
    // Track which mini-fanouts we've already counted to avoid double-counting when multiple hotspots share one
    const countedMiniFanouts = new Set<string>();
    const ataBalancePerHotspot: BN[] = uniqueHotspots.map((_, idx) => {
      const miniFanout = miniFanouts[idx];
      if (!miniFanout) return new BN(0);

      const tokenAccountAddress = miniFanout.tokenAccount?.toBase58();
      if (!tokenAccountAddress) return new BN(0);

      // Only count each mini-fanout's ATA balance once (attribute to first hotspot that uses it)
      if (countedMiniFanouts.has(tokenAccountAddress)) return new BN(0);
      countedMiniFanouts.add(tokenAccountAddress);

      const ataBalance = tokenAccountBalances.get(tokenAccountAddress);
      if (!ataBalance || ataBalance.isZero()) return new BN(0);

      return getUserShareAmount(miniFanout, ataBalance);
    });

    const pendingInMiniFanoutATAs = ataBalancePerHotspot.reduce(
      (acc, bn) => acc.add(bn),
      new BN(0),
    );

    const totalPendingBn = netPendingPerHotspot
      .reduce((acc, bn) => acc.add(bn), new BN(0))
      .add(pendingInMiniFanoutATAs);

    // Calculate claimable vs automated totals
    let claimableBn = new BN(0);
    let automatedBn = pendingInMiniFanoutATAs; // ATA balance is always automated

    const byHotspot = (
      await Promise.all(
        uniqueHotspots.map(async (hotspot, idx) => {
          const oraclePendingBn = netPendingPerHotspot[idx]!;
          const ataPendingBn = ataBalancePerHotspot[idx]!;
          const totalPendingBn = oraclePendingBn.add(ataPendingBn);
          const miniFanout = miniFanouts[idx];
          const zeroOut = await tokenOutput(new BN(0));

          const isAutomated = hasAutomation || !!miniFanout;
          if (isAutomated) {
            automatedBn = automatedBn.add(oraclePendingBn);
          } else {
            claimableBn = claimableBn.add(oraclePendingBn);
          }

          if (totalPendingBn.isZero()) return null;

          const totalOut = await tokenOutput(totalPendingBn);
          return {
            hotspotPubKey: hotspot.entityKey,
            pending: {
              total: totalOut,
              claimable: isAutomated ? zeroOut : totalOut,
              automated: isAutomated ? totalOut : zeroOut,
            },
          };
        }),
      )
    ).filter(truthy);

    closeSingleton(connection);

    const totalOut = await tokenOutput(totalPendingBn);

    return {
      pending: {
        total: totalOut,
        claimable: await tokenOutput(claimableBn),
        automated: await tokenOutput(automatedBn),
      },
      byHotspot,
    };
  });
