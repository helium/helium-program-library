import * as client from "@helium/distributor-oracle";
import { init } from "@helium/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  useConnection,
  useMetadata,
  useNavigation,
  usePublicKey,
} from "react-xnft";
import { useNotification } from "../contexts/notification";
import { LAZY_KEY } from "../utils";

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
  const [loading, setLoading] = useState<boolean>(false);
  const publicKey = usePublicKey();
  const connection = useConnection();
  const { setMessage } = useNotification();

  const claimRewards = useCallback(async () => {
    if (nft) {
      if (loading) return;
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
    }
  }, [nft]);

  return {
    claimRewards,
    loading,
  };
};
