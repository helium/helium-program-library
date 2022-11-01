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
  const { claimRewards, loading } = useClaimRewards(nft);
  const hasRewards = pendingRewards && pendingRewards > 0;
  const buttonClass = useMemo(() =>
    classnames(
      "!px-5 !py-0 border-0 rounded-sm bg-green-600",
      { "hover:bg-green-700": hasRewards && !loading },
      { "opacity-50": !hasRewards || loading }
    ),
    [hasRewards, loading]
  );

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
            <Text tw="text-left w-20 truncate text-md font-bold text-zinc-900 dark:text-white !m-0">
              {nft.tokenMetaUriData.name}
            </Text>
            <View tw="flex justify-end">
              <Button
                tw={buttonClass}
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
                {loading && (
                  <Svg
                    tw="inline mr-2 w-4 h-4 text-white/[.5] animate-spin fill-white"
                    viewBox="0 0 100 101"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <Path
                      d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                      fill="currentColor"
                    />
                    <Path
                      d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                      fill="currentFill"
                    />
                  </Svg>
                )}
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
              {`${pendingRewards == null ? "..." : numberWithCommas(pendingRewards, 4)} ${
                symbol || ""
              }`}
            </Text>
          </View>
        </View>
      </View>
    </Button>
  );
};
