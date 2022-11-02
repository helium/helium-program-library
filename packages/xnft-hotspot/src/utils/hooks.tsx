import * as client from "@helium/distributor-oracle";
import { init } from "@helium/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { useCallback, useEffect, useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  useConnection,
  useMetadata,
  useNavigation,
  usePublicKey,
} from "react-xnft";
import { useNotification } from "../contexts/notification";
import { LAZY_KEY, useProgram } from "../utils";
import { useAsyncCallback } from "react-async-hook";
import { ProgramError, sendAndConfirmWithRetry } from "@helium/spl-utils";

export const useColorMode = ({
  light,
  dark,
}: {
  light: string;
  dark: string;
}): string => {
  const metadata = useMetadata();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (metadata) {
      metadata.isDarkMode ? setValue(dark) : setValue(light);
    }
  }, [metadata, setValue]);

  return value;
};

export const useTitleColor = () => {
  const nav = useNavigation();
  const metadata = useMetadata();

  useEffect(() => {
    if (!metadata || !nav) return;
    nav.setTitleStyle({
      color: metadata.isDarkMode ? "#ffffff" : "#333333",
    });
  }, [metadata.isDarkMode]);
};

// TODO: type nft
export const useClaimRewards = (nft: any) => {
  const publicKey = usePublicKey();
  const connection = useConnection();
  const program = useProgram();
  const { setMessage } = useNotification();
  const { error, execute, loading } = useAsyncCallback(async () => {
    if (nft && program) {
      if (loading) return;
      const stubProvider = new anchor.AnchorProvider(
        connection,
        //@ts-ignore
        { publicKey },
        anchor.AnchorProvider.defaultOptions()
      );
      const program = await init(stubProvider)
      const rewards = await client.getCurrentRewards(
        program,
        LAZY_KEY,
        new PublicKey(nft.mint)
      );
      const tx = await client.formTransaction({
        program,
        //@ts-ignore
        provider: window.xnft.solana,
        rewards,
        hotspot: new PublicKey(nft.mint),
        lazyDistributor: LAZY_KEY,
        wallet: publicKey,
      });

      //@ts-ignore
      await window.xnft.solana.sendAndConfirm(tx);
      setMessage("Transaction confirmed", "success");
    }
  });

  useEffect(() => {
    if (error) {
      console.error(error);
      setMessage(`Transaction failed: ${error.message}`, "error");
    }
  }, [error])

  return {
    claimRewards: execute,
    loading,
  };
};
