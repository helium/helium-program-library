import * as client from "@helium/distributor-oracle";
import { init } from "@helium/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import classnames from "classnames";
import React, { FC, useMemo, useState } from "react";
import {
  Button, Image, Loading, Text, useConnection, usePublicKey, View
} from "react-xnft";
import { useNotification } from "../../../contexts/notification";
import { usePendingRewards } from "../../../hooks/usePendingRewards";
import { LAZY_KEY } from "../../../utils";
import { useTitleColor } from "../../../utils/hooks";

interface HotspotDetailScreenProps {
  nft: any; // TODO: actually type this
  symbol: string;
}

export const HotspotDetailScreen: FC<HotspotDetailScreenProps> = ({
  nft,
  symbol,
}) => {
  useTitleColor();
  const publicKey = usePublicKey();
  const connection = useConnection();
  const [txLoading, setLoading] = useState<boolean>(false);
  const { setMessage } = useNotification();
  const mint = useMemo(
    () => new PublicKey(nft.metadata.mint),
    [nft.metadata.mint]
  );

  const pendingRewards = usePendingRewards(mint);
  const hasRewards = pendingRewards && pendingRewards > 0;

  const claimRewards = async () => {
    if (txLoading) return;
    setLoading(true);
    try {
      const stubProvider = new anchor.AnchorProvider(
        connection,
        //@ts-ignore
        { publicKey },
        anchor.AnchorProvider.defaultOptions()
      );
      const program = await init(stubProvider);
      const rewards = await client.getCurrentRewards(
        program,
        LAZY_KEY,
        new PublicKey(nft.metadata.mint)
      );
      const tx = await client.formTransaction({
        program,
        //@ts-ignore
        provider: window.xnft.solana,
        rewards,
        hotspot: new PublicKey(nft.metadata.mint),
        lazyDistributor: LAZY_KEY,
        wallet: publicKey,
      });

      //@ts-ignore
      const signed = await window.xnft.solana.signTransaction(tx);
      const sig = await connection.sendRawTransaction(
        // xNFT background connection just sucks and doesn't actually like buffer.
        // @ts-ignore
        Array.from(signed.serialize()),
        { skipPreflight: true }
      );
      await connection.confirmTransaction(sig, "confirmed");
      setLoading(false);
      setMessage("Transaction confirmed", "success");
    } catch (err) {
      setLoading(false);
      setMessage(`Transaction failed: ${err.message}`, "error");
      console.error(err);
    }
  };

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
          tw={classnames([
            "h-12 w-full text-white font-bold text-md border-0 rounded-md flex justify-center items-center",
            ...[hasRewards && ["bg-green-600", "hover:bg-green-700"]],
            ...[!hasRewards && "bg-green-600/[0.5]"],
          ])}
          onClick={hasRewards ? () => claimRewards() : () => {}}
        >
          <Text tw="inline">
            {hasRewards ? `Claim rewards` : `No rewards to claim`}
          </Text>
          {txLoading && (
            <Loading style={{ marginLeft: '5px'}}/>
          )}
        </Button>
      </View>
    </View>
  );
};
