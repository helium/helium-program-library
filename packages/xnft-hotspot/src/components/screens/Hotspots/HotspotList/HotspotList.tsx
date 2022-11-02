import React, { FC, useEffect } from "react";
import { Text, View, Button, usePublicKey, useConnection } from "react-xnft";
import * as anchor from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { init } from "@helium/lazy-distributor-sdk";
import * as client from "@helium/distributor-oracle";
import { HotspotListItem } from "./HotspotListItem";
import { LAZY_KEY, useTokenAccounts } from "../../../../utils/index";
import { LoadingIndicator, SvgSpinner } from "../../../common";
import { useStyledTitle } from "../../../../utils/hooks";
import { useAsyncCallback } from "react-async-hook";
import { useNotification } from "../../../../contexts/notification";

interface HotspotListScreenProps {}

export const HotspotListScreen: FC<HotspotListScreenProps> = () => {
  useStyledTitle(true);
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
          { skipPreflight: true }
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
  }, [error]);

  if (!tokenAccounts) return <LoadingIndicator />;

  return (
    <View tw="flex flex-col pt-5">
      <View tw="flex flex-col px-5 gap-2">
        {tokenAccounts.map((nft) => (
          <HotspotListItem key={nft.metadata.mint} nft={nft} />
        ))}
        {tokenAccounts.map((nft) => (
          <HotspotListItem key={nft.metadata.mint} nft={nft} />
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
