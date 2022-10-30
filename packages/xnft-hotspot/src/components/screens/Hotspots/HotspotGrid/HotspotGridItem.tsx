import React, { FC, useState, useEffect } from "react";
import { useNavigation, Image, Text, Button, useConnection } from "react-xnft";
import { getPendingRewards, useProgram } from "../../../../utils/index";
import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { Flex } from "../../../common";
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
  }, [program, nft]);

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
  }, [rewardsMint, connection]);

  const clickNft = () => {
    nav.push("detail", { nft, pendingRewards, symbol });
  };

  console.log(nft);
  return (
    <Button
      onClick={() => clickNft()}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "auto",
        border: "none",
        background: useColorMode(THEME.colors.backgroundAccent),
        borderRadius: "6px",
        padding: "12px",
        cursor: 'pointer',
      }}
    >
      <Flex flexDirection="column" padding="0px">
        <Flex mb={1}>
          <Text
            style={{
              textAlign: "center",
              position: "absolute",
              bottom: "4px",
              left: "4px",
              width: "60%",
              background: THEME.colors.gray[700],
              padding: "2px 4px",
              borderRadius: "4px",
              fontSize: "15px",
              fontWeight: 600,
              lineHeight: "normal",
              color: THEME.colors.white,
              margin: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {nft.tokenMetaUriData.name}
          </Text>
          <Image
            src={nft.tokenMetaUriData.image}
            style={{
              borderRadius: "6px",
              width: "140px",
            }}
          />
        </Flex>
        <Flex alignItems="center">
          <Text
            style={{
              marginLeft: "6px",
              fontSize: "14px",
              fontWeight: 600,
              lineHeight: "normal",
              margin: 0,
              color: useColorMode({
                light: THEME.colors.gray[700],
                dark: THEME.colors.gray[400],
              }),
            }}
          >
            Rewards:&nbsp;
          </Text>
          <Text
            style={{
              fontSize: "12px",
              lineHeight: "normal",
              margin: 0,
              color: useColorMode({
                light: THEME.colors.gray[600],
                dark: THEME.colors.gray[500],
              }),
            }}
          >
            {`${pendingRewards || "0"} ${symbol || ""}`}
          </Text>
        </Flex>
      </Flex>
    </Button>
  );
};
