import { numberWithCommas } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import classnames from "classnames";
import React, { FC, useMemo } from "react";
import { Button, Image, Text, View } from "react-xnft";
import { SvgSpinner } from "../../../components/common";
import { useFetchedCachedJson } from "../../../hooks/useFetchedJson";
import { usePendingRewards } from "../../../hooks/usePendingRewards";
import { useClaimRewards, useStyledTitle } from "../../../utils/hooks";

interface HotspotDetailScreenProps {
  nft: any; // TODO: actually type this
  symbol: string;
}

export const HotspotDetailScreen: FC<HotspotDetailScreenProps> = ({
  nft,
  symbol,
}) => {
  useStyledTitle(false);
  const { claimRewards, loading } = useClaimRewards(nft);
  const mint = useMemo(() => new PublicKey(nft.mint), [nft.mint]);

  const pendingRewards = usePendingRewards(mint);
  const hasRewards = pendingRewards && pendingRewards > 0;
  const { result: tokenMetaUriData } = useFetchedCachedJson(nft.data.uri);

  return (
    <View tw="flex flex-col">
      <View tw="flex flex-col px-5 mb-2 gap-5">
        <Text tw="text-lg text-center font-bold !m-0 text-zinc-700 dark:text-zinc-500">
          {tokenMetaUriData?.name}
        </Text>
        <View tw="flex flex-row p-1 rounded-lg bg-zinc-200 dark:bg-zinc-900">
          <Image tw="rounded-md w-full" src={tokenMetaUriData?.image} />
        </View>
        <View tw="flex flex-col p-1">
          <Text tw="text-lg pb-2 mb-2 border-b border-zinc-700 w-full text-zinc-700 dark:text-zinc-200">
            Details
          </Text>

          <View tw="flex flex-col gap-2">
            <View tw="flex flex-row items-baseline justify-between">
              <Text tw="text-sm font-bold !m-0 text-zinc-700 dark:text-zinc-400">
                Pending rewards:&nbsp;
              </Text>
              <Text tw="text-xs px-3 py-1 !m-0 text-zinc-700 dark:text-zinc-400 rounded-md bg-zinc-200 dark:bg-zinc-900">
                {`${
                  pendingRewards == null
                    ? "..."
                    : numberWithCommas(pendingRewards, 4)
                } ${symbol || ""}`}
              </Text>
            </View>

            <View tw="flex flex-row items-baseline justify-between">
              <Text tw="text-sm font-bold !m-0 text-zinc-700 dark:text-zinc-400">
                Description:&nbsp;
              </Text>
              <Text tw="text-xs px-3 py-1 !m-0 text-zinc-700 dark:text-zinc-400 rounded-md bg-zinc-200 dark:bg-zinc-900">
                {tokenMetaUriData?.description}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View tw="flex w-full justify-center sticky bottom-0 p-5 bg-gradient-to-b from-white/[.0] to-zinc-200/[.5] dark:to-zinc-900/[.5]">
        <Button
          tw={classnames(
            "h-12 w-full border-0 rounded-lg flex justify-center items-center bg-green-600",
            { "hover:bg-green-700/[.9]": hasRewards },
            { "bg-green-900": !hasRewards }
          )}
          onClick={hasRewards ? () => claimRewards() : () => {}}
        >
          {loading && (
            <SvgSpinner tw="inline mr-2 w-6 h-6 text-white/[.5] animate-spin fill-white" />
          )}
          <Text tw="inline text-white text-md font-bold">
            {hasRewards
              ? !loading
                ? `Claim rewards`
                : `Claiming...`
              : `No rewards to claim`}
          </Text>
        </Button>
      </View>
    </View>
  );
};
