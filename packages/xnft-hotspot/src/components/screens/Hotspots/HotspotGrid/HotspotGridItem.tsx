import { MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import React, { FC, useMemo } from "react";
import { Button, Image, Text, useNavigation, View } from "react-xnft";
import classnames from "classnames";
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
  const pendingRewards = usePendingRewards(mint);
  const hasRewards = pendingRewards && pendingRewards > 0;

  const clickNft = () => {
    nav.push("detail", { nft, symbol });
  };

  return (
    <Button
      tw="flex flex-col w-auto border-0 !p-3 mb-2 rounded-md bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-900/[0.6]"
      onClick={() => clickNft()}
    >
      <View tw="flex w-full gap-x-3 justify-center items-center">
        <Image
          tw="rounded-md"
          src={nft.tokenMetaUriData.image}
          style={{ width: "60px" }}
        />
        <View tw="flex flex-col gap-2 grow h-full justify-center">
          <View tw="flex flex-row justify-between items-center">
            <Text tw="text-left w-20 truncate text-sm font-bold text-zinc-900 dark:text-white !m-0">
              {nft.tokenMetaUriData.name}
            </Text>
            <View tw="flex justify-end">
              <Button
                tw={classnames(
                  "!px-4 !py-1 text-white font-bold text-xs border-0 rounded-sm bg-green-600",
                  { "hover:bg-green-700": hasRewards },
                  { "opacity-50": !hasRewards }
                )}
                onClick={
                  hasRewards
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("claim");
                      }
                    : () => {}
                }
              >
                Claim
              </Button>
            </View>
          </View>
          <View tw="flex flex-row justify-between items-center">
            <Text tw="text-sm font-bold !m-0 text-gray-500 dark:text-zinc-600">
              Pending Rewards:&nbsp;
            </Text>
            <Text tw="text-sm !m-0 text-gray-600 dark:text-gray-500">
              {`${pendingRewards == null ? "..." : pendingRewards} ${
                symbol || ""
              }`}
            </Text>
          </View>
        </View>
      </View>
    </Button>
  );
};
