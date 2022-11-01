import React, { FC, useState, useEffect } from "react";
import {
  View,
  Button,
  Image,
  Text,
  useNavigation,
  useConnection,
} from "react-xnft";
import { getPendingRewards, useProgram } from "../../../../utils/index";
import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { THEME } from "../../../../utils/theme";
import { useColorMode } from "../../../../utils/hooks";

interface HotspotGridItemProps {
  nft: any; // TODO: actually type this
}

export const HotspotGridItem: FC<HotspotGridItemProps> = ({ nft }) => {
  const [symbol, setSymbol] = useState<string>("");
  const [rewardsMint, setRewardsMint] = useState<PublicKey | null>(null);
  const [pendingRewards, setPendingRewards] = useState<number | null>(null);
  const [interval, setNewInterval] = useState<any>(null);
  const nav = useNavigation();
  const program = useProgram();
  const connection = useConnection();

  useEffect(() => {
    (async () => {
      if (!program || !nft.metadata.mint) return null;
      const nftMint = new PublicKey(nft.metadata.mint);

      //@ts-ignore
      const { pendingRewards: rewards, rewardsMint: rwdMint } =
        await getPendingRewards(program, nftMint);

      setPendingRewards(rewards);
      setRewardsMint(rwdMint);

      if (interval) clearInterval(interval);

      const ivl = setInterval(async () => {
        const { pendingRewards: newRewards } = await getPendingRewards(
          program,
          nftMint
        );
        setPendingRewards(newRewards);
      }, 30000);

      setNewInterval(ivl);
    })();

    return () => clearInterval(interval);
  }, [program, nft.metadata.mint]);

  useEffect(() => {
    if (!rewardsMint || !connection) return;
    (async () => {
      const metadata = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata", "utf-8"),
          MPL_PID.toBuffer(),
          rewardsMint.toBuffer(),
        ],
        MPL_PID
      )[0];
      //@ts-ignore
      const acc = await connection.getAccountInfo(metadata);
      const meta = Metadata.fromAccountInfo(acc!)[0];
      setSymbol(meta.data.symbol);
    })();
  }, [rewardsMint?.toBase58(), connection]);

  const clickNft = () => {
    nav.push("detail", { nft, pendingRewards, symbol });
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
          <Text tw="text-md font-bold !m-0 text-gray-500 dark:text-zinc-600">
            Rewards:&nbsp;
          </Text>
          <Text tw="text-xs !m-0 text-gray-600 dark:text-gray-500">
            {`${pendingRewards || "0"} ${symbol || ""}`}
          </Text>
        </View>
      </View>
    </Button>
  );
};
