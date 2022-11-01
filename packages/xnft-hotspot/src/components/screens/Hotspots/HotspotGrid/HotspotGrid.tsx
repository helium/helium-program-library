import React, { FC, useEffect } from "react";
import { Text, View, Button, usePublicKey, useConnection, Loading } from "react-xnft";
import * as anchor from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { init } from "@helium/lazy-distributor-sdk";
import * as client from "@helium/distributor-oracle";
import ky from "ky";
import { HotspotGridItem } from "./HotspotGridItem";
import { LAZY_KEY, useTokenAccounts } from "../../../../utils/index";
import { LoadingIndicator } from "../../../common";
import { useTitleColor } from "../../../../utils/hooks";
import { sendAndConfirmWithRetry } from "@helium/spl-utils";
import { useAsyncCallback } from "react-async-hook";
import { useNotification } from "../../../../contexts/notification";

interface HotspotGridScreenProps {}

export const HotspotGridScreen: FC<HotspotGridScreenProps> = () => {
  useTitleColor();
  const tokenAccounts = useTokenAccounts();
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
      tokenAccounts.map(async (nft) => {
        const rewards = await client.getCurrentRewards(
          program,
          LAZY_KEY,
          new PublicKey(nft.metadata.mint)
        );
        return await client.formTransaction({
          program,
          //@ts-ignore
          provider: window.xnft.solana,
          rewards,
          hotspot: new PublicKey(nft.metadata.mint),
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
        const sig = await connection.sendRawTransaction(
          // xNFT background connection just sucks and doesn't actually like buffer.
          // @ts-ignore
          Array.from(tx.serialize()),
          { skipPreflight: true },
        );
        await connection.confirmTransaction(sig, "confirmed");
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
  }, [error])

  if (!tokenAccounts) return <LoadingIndicator />;

  return (
    <View tw="flex flex-col">
      <View tw="flex flex-col px-5 mb-5">
        {tokenAccounts.map((nft) => (
          <HotspotGridItem key={nft.metadata.mint} nft={nft} />
        ))}
      </View>
      <View tw="flex w-full justify-center sticky bottom-0 p-5 bg-white dark:bg-zinc-800">
        <Button
          tw="h-12 w-full text-white font-bold text-md border-0 rounded-md bg-green-600 hover:bg-green-700"
          onClick={() => execute()}
        >
          <Text tw="inline">
            Claim all rewards
          </Text>
          {loading && <Loading style={{ marginLeft: "5px" }} />}
        </Button>
      </View>
    </View>
  );
};
