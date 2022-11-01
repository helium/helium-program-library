import { MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import React, { FC, useMemo } from "react";
import {
  Button,
  Image,
  Text,
  useNavigation, View
} from "react-xnft";
import { useMetaplexMetadata } from "../../../../hooks/useMetaplexMetadata";
import { usePendingRewards } from "../../../../hooks/usePendingRewards";

interface HotspotGridItemProps {
  nft: any; // TODO: actually type this
}

export const HotspotGridItem: FC<HotspotGridItemProps> = ({ nft }) => {
  const mint = useMemo(
    () => new PublicKey(nft.metadata.mint),
    [nft.metadata.mint]
  );
  const nav = useNavigation();
  const { info: metadata } = useMetaplexMetadata(MOBILE_MINT);
  const symbol = metadata?.data.symbol;
  const pendingRewards = usePendingRewards(mint)

  const clickNft = () => {
    nav.push("detail", { nft, symbol });
  };

  return (
    <Button
      tw="flex flex-col w-auto border-0 !p-3 mb-2 rounded-md bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-400 dark:hover:bg-zinc-900/[0.6]"
      onClick={() => clickNft()}
    >
      <View tw="flex flex-col">
        <View tw="flex flex-row relative mb-2">
          <Text
            tw="text-center absolute bottom-1 left-1 w-3/5 bg-zinc-700 !px-0.5 !py-1 rounded-md text-sm font-bold text-white !m-0"
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {nft.tokenMetaUriData.name}
          </Text>
          <Image
            tw="rounded-md"
            src={nft.tokenMetaUriData.image}
            style={{
              width: "140px",
            }}
          />
        </View>
        <View tw="flex flex-row items-baseline mt-1">
          <Text tw="text-md font-bold !m-0 text-white dark:text-zinc-600">
            Rewards:&nbsp;
          </Text>
          <Text tw="text-xs !m-0 text-gray-600 dark:text-gray-500">
            {`${pendingRewards == null ? "..." : pendingRewards} ${symbol || ""}`}
          </Text>
        </View>
      </View>
    </Button>
  );
};
