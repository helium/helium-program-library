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
import classnames from "classnames";

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
  const hasRewards = pendingRewards && pendingRewards > 0;

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
              {`${pendingRewards || "0"} ${symbol || ""}`}
            </Text>
          </View>
        </View>
      </View>
    </Button>
  );
};
