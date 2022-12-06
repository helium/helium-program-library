import React, { FC, useEffect } from "react";
import { Text, View, Button, usePublicKey, useConnection } from "react-xnft";
import * as anchor from "@project-serum/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { init } from "@helium/lazy-distributor-sdk";
import * as client from "@helium/distributor-oracle";
import { HotspotListItem } from "./HotspotListItem";
import { LAZY_KEY, useRewardableNfts } from "../../../../utils/index";
import { LoadingIndicator, SvgSpinner } from "../../../common";
import { useStyledTitle } from "../../../../utils/hooks";
import { useAsyncCallback } from "react-async-hook";
import { useNotification } from "../../../../contexts/notification";
import { sendAndConfirmWithRetry } from "@helium/spl-utils";

interface HotspotListScreenProps {}

export const HotspotListScreen: FC<HotspotListScreenProps> = () => {
  useStyledTitle(true);
  const { result: assets } = useRewardableNfts();
  const publicKey = usePublicKey();
  const connection = useConnection();
  const { setMessage } = useNotification();

  const claimAllRewards = async () => {
    //@ts-ignore
    const stubProvider = new anchor.AnchorProvider(
      connection,
      //@ts-ignore
      { publicKey },
      anchor.AnchorProvider.defaultOptions()
    );
    const program = await init(stubProvider);

    const txs = await Promise.all(
      (assets || []).map(async (nft) => {
        const rewards = await client.getCurrentRewards(
          program,
          LAZY_KEY,
          new PublicKey(nft.id)
        );
        return await client.formTransaction({
          program,
          //@ts-ignore
          provider: window.xnft.solana,
          rewards,
          hotspot: new PublicKey(nft.id),
          lazyDistributor: LAZY_KEY,
          wallet: publicKey,
        });
      })
    );
    //@ts-ignore
    const signed = await window.xnft.solana.signAllTransactions(txs, [], {
      skipPreflight: true,
    });
    await Promise.all(
      signed.map(async (tx: Transaction) => {
        await sendAndConfirmWithRetry(
          // @ts-ignore
          new Connection(connection._rpcEndpoint),
          tx.serialize(),
          { skipPreflight: true },
          "confirmed"
        );
      })
    );
    setMessage("Claimed all rewards!", "success");
  };
  const { execute, loading, error } = useAsyncCallback(claimAllRewards);

  useEffect(() => {
    if (error) {
      setMessage(`Transaction failed: ${error.message}`, "error");
      console.error(error);
    }
  }, [error]);

  if (!assets) return <LoadingIndicator />;

  return (
    <View tw="flex flex-col pt-5 justify-between h-full">
      <View tw="flex flex-col px-5 gap-2">
        {assets.map((nft) => (
          <HotspotListItem key={nft.id.toBase58()} nft={nft} />
        ))}
      </View>
      <View tw="flex w-full justify-center sticky bottom-0 p-5 bg-gradient-to-b from-white/[.0] to-zinc-200/[.5] dark:to-zinc-900/[.5]">
        <Button
          tw="h-12 w-full border-0 rounded-md bg-green-600 hover:bg-green-700/[.9]"
          onClick={() => execute()}
        >
          {loading && (
            <SvgSpinner tw="inline mr-2 w-6 h-6 text-white/[.5] animate-spin fill-white" />
          )}
          <Text tw="inline text-white font-bold text-md ">
            {loading ? "Claiming..." : "Claim all rewards"}
          </Text>
        </Button>
      </View>
    </View>
  );
};
