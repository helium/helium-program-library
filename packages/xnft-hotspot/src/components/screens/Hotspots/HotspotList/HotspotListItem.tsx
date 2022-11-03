import { PublicKey } from "@solana/web3.js";
import { MOBILE_MINT, numberWithCommas } from "@helium/spl-utils";
import React, { FC, useMemo } from "react";
import {
  Button,
  Image,
  Text,
  useNavigation,
  View,
  Svg,
  Path,
} from "react-xnft";
import classnames from "classnames";
import { useMetaplexMetadata } from "../../../../hooks/useMetaplexMetadata";
import { usePendingRewards } from "../../../../hooks/usePendingRewards";
import { useClaimRewards } from "../../../../utils/hooks";
import { useFetchedCachedJson } from "../../../../hooks/useFetchedJson";
import { SvgSpinner } from "../../../common";

interface HotspotListItemProps {
  nft: any; // TODO: actually type this
}

export const HotspotListItem: FC<HotspotListItemProps> = ({ nft }) => {
  const mint = useMemo(() => new PublicKey(nft.mint), [nft.mint]);
  const { result: tokenMetaUriData } = useFetchedCachedJson(nft.data.uri);
  const nav = useNavigation();
  const { info: metadata } = useMetaplexMetadata(MOBILE_MINT);
  const symbol = metadata?.data.symbol;
  const pendingRewards = usePendingRewards(mint);
  const { claimRewards, loading } = useClaimRewards(nft);
  const hasRewards = pendingRewards && pendingRewards > 0;

  const clickNft = () => {
    nav.push("detail", { nft, symbol });
  };

  return (
    <Button
      tw="flex flex-col w-auto border-0 !p-3 rounded-md bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-900/[0.6]"
      onClick={() => clickNft()}
    >
      <View tw="flex w-full gap-x-3 justify-center items-center">
        <Image
          tw="rounded-md"
          src={tokenMetaUriData?.image}
          style={{ width: "60px" }}
        />
        <View tw="flex flex-col gap-2 grow justify-center">
          <View tw="flex flex-row justify-between items-center">
            <Text tw="text-left w-20 truncate text-md font-bold text-zinc-900 dark:text-white !m-0">
              {nft.data.name}
            </Text>
            <View tw="flex justify-end">
              <Button
                tw={classnames(
                  "!px-2 !py-0 border-0 rounded-md bg-green-600",
                  { "hover:bg-green-700": hasRewards && !loading },
                  { "opacity-50 cursor-not-allowed": !hasRewards || loading }
                )}
                onClick={
                  hasRewards && !loading
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        claimRewards();
                      }
                    : () => {}
                }
              >
                {loading && <SvgSpinner />}
                <Text tw="inline text-white font-bold text-xs leading-6">
                  {loading ? `Claiming...` : `Claim`}
                </Text>
              </Button>
            </View>
          </View>
          <View tw="flex flex-row justify-between items-center">
            <Text tw="text-sm font-bold !m-0 text-gray-500 dark:text-zinc-600">
              Pending Rewards:&nbsp;
            </Text>
            <Text tw="text-sm !m-0 text-gray-600 dark:text-gray-500">
              {`${
                pendingRewards == null
                  ? "..."
                  : numberWithCommas(pendingRewards, 4)
              } ${symbol || ""}`}
            </Text>
          </View>
        </View>
      </View>
    </Button>
  );
};
