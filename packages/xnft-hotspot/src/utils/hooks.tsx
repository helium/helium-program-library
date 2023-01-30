import * as client from "@helium/distributor-oracle";
import { init } from "@helium/lazy-distributor-sdk";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import {
  useConnection,
  useMetadata,
  useNavigation,
  usePublicKey
} from "react-xnft";
import { base64DarkLogo, base64LightLogo } from "../constants";
import { useNotification } from "../contexts/notification";
import { LAZY_KEY, useProgram } from "../utils";
import { THEME } from "../utils/theme";

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

export const useStyledTitle = (showLogo = false) => {
  const nav = useNavigation();
  const metadata = useMetadata();
  const bgAccentColor = useColorMode(THEME.colors.backgroundAccent);

  useEffect(() => {
    if (!metadata || !nav) return;

    nav.setTitleStyle({
      color: metadata.isDarkMode ? "#ffffff" : "#333333",
    });

    if (showLogo) {
      nav.setStyle({
        backgroundImage: metadata.isDarkMode
          ? `url(${base64LightLogo})`
          : `url(${base64DarkLogo})`,
        backgroundSize: "30px",
        backgroundPosition: "20px 14px",
        backgroundRepeat: "no-repeat",
        backgroundColor: "rgba(0, 0, 0, 0.1)",
      });
    } else {
      nav.setStyle({
        backgroundImage: "none",
        backgroundSize: "none",
        backgroundPosition: "none",
        backgroundRepeat: "none",
        backgroundColor: "transparent",
      });
    }
  }, [metadata.isDarkMode, bgAccentColor]);
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
