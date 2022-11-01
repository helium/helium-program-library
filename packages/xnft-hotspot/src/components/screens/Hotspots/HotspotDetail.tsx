import { PublicKey } from "@solana/web3.js";
import classnames from "classnames";
import React, { FC, useMemo } from "react";
import { Button, Image, Loading, Text, View } from "react-xnft";
import { usePendingRewards } from "../../../hooks/usePendingRewards";
import { useClaimRewards, useTitleColor } from "../../../utils/hooks";

interface HotspotDetailScreenProps {
  nft: any; // TODO: actually type this
  symbol: string;
}

export const HotspotDetailScreen: FC<HotspotDetailScreenProps> = ({
  nft,
  symbol,
}) => {
  useTitleColor();
  const { claimRewards, loading } = useClaimRewards(nft);
  const mint = useMemo(
    () => new PublicKey(nft.metadata.mint),
    [nft.metadata.mint]
  );

  const pendingRewards = usePendingRewards(mint);
  const hasRewards = pendingRewards && pendingRewards > 0;

  return (
    <View tw="flex flex-col px-5">
      <View tw="flex flex-row p-3 rounded-md bg-zinc-200 dark:bg-zinc-900 mb-5">
        <Image tw="rounded-md w-full" src={nft.tokenMetaUriData.image} />
      </View>
      <View tw="flex flex-col p-1">
        <Text tw="text-lg font-bold !m-0 text-zinc-700 dark:text-zinc-200">
          {nft.tokenMetaUriData.name}
        </Text>
        <View tw="flex flex-row items-baseline">
          <Text tw="text-md font-bold !m-0 text-zinc-700 dark:text-zinc-400">
            Pending rewards:&nbsp;
          </Text>
          <Text tw="text-sm !m-0 text-zinc-700 dark:text-zinc-200">
            {pendingRewards || "0"} {symbol || ""}
          </Text>
        </View>

        <View tw="flex flex-row items-baseline">
          <Text tw="text-md font-bold !m-0 text-zinc-700 dark:text-zinc-400">
            Description:&nbsp;
          </Text>
          <Text tw="text-sm !m-0 text-zinc-700 dark:text-zinc-200">
            {nft.tokenMetaUriData.description}
          </Text>
        </View>
      </View>

      <View tw="flex flex-row mt-5 mb-5">
        <Button
          tw={classnames(
            "h-12 w-full border-0 rounded-md flex justify-center items-center bg-green-600",
            { "hover:bg-green-700": hasRewards },
            { "opacity-50": !hasRewards }
          )}
          onClick={hasRewards ? () => claimRewards() : () => {}}
        >
          <Text tw="inline text-white text-md font-bold">
            {hasRewards ? `Claim rewards` : `No rewards to claim`}
          </Text>
          {loading && <Loading style={{ marginLeft: "5px" }} />}
        </Button>
      </View>
    </View>
  );
};
