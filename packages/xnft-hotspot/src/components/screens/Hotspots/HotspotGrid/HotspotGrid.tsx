import React, { FC } from "react";
import { View, Button, usePublicKey, useConnection } from "react-xnft";
import * as anchor from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { init } from "@helium/lazy-distributor-sdk";
import * as client from "@helium/distributor-oracle";
import ky from "ky";
import { HotspotGridItem } from "./HotspotGridItem";
import { LAZY_KEY, useTokenAccounts } from "../../../../utils/index";
import { LoadingIndicator } from "../../../common";
import { useTitleColor } from "../../../../utils/hooks";

interface HotspotGridScreenProps {}

export const HotspotGridScreen: FC<HotspotGridScreenProps> = () => {
  useTitleColor();
  const tokenAccounts = useTokenAccounts();
  const publicKey = usePublicKey();
  const connection = useConnection();

  if (!tokenAccounts) return <LoadingIndicator />;

  const claimAllRewards = async () => {
    //@ts-ignore
    const stubProvider = new anchor.AnchorProvider(
      connection,
      //@ts-ignore
      { publicKey },
      anchor.AnchorProvider.defaultOptions()
    );
    const program = await init(stubProvider);

    for (const nft of tokenAccounts) {
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
        wallet: publicKey
      });

      //@ts-ignore
      await window.xnft.solana.send(tx, [], { skipPreflight: true });
    }
  };

  return (
    <View tw="flex flex-col">
      <View tw="flex flex-row flex-wrap justify-between px-5 mb-5">
        {tokenAccounts.map((nft) => (
          <HotspotGridItem key={nft.metadata.mint} nft={nft} />
        ))}
      </View>
      <View tw="flex w-full justify-center sticky bottom-0 p-5 bg-white dark:bg-zinc-800">
        <Button
          tw="h-12 w-full text-white font-bold text-md border-0 rounded-md bg-green-600 hover:bg-green-700"
          onClick={() => claimAllRewards()}
        >
          Claim all rewards
        </Button>
      </View>
    </View>
  );
};
