import React, { FC, useState } from "react";
import {
  usePublicKey,
  useConnection,
  Image,
  Text,
  Button,
  Loading,
} from "react-xnft";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { init } from "@helium/lazy-distributor-sdk";
import * as client from "@helium/distributor-oracle";
import ky from "ky";
import { THEME } from "../../../utils/theme";
import { LAZY_KEY } from "../../../utils";
import { useNotification } from "../../../contexts/notification";
import { useColorMode, useTitleColor } from "../../../utils/hooks";
import { Flex } from "../../common";

interface HotspotDetailScreenProps {
  nft: any; // TODO: actually type this
  pendingRewards: any; // TODO: actually type this
  symbol: string;
}

export const HotspotDetailScreen: FC<HotspotDetailScreenProps> = ({
  nft,
  pendingRewards,
  symbol,
}) => {
  useTitleColor();
  const publicKey = usePublicKey();
  const connection = useConnection();
  const [txLoading, setLoading] = useState<boolean>(false);
  const { setMessage } = useNotification();
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
      const tx = await client.formTransaction(
        program,
        //@ts-ignore
        window.xnft.solana,
        rewards,
        new PublicKey(nft.metadata.mint),
        LAZY_KEY,
        publicKey
      );

      const serializedTx = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const res = await ky.post("http://localhost:8080/", {
        json: { transaction: serializedTx },
      });

      const json = (await res.json()) as any;
      const signedTx = Transaction.from(json!.transaction!.data);

      //@ts-ignore
      await window.xnft.solana.send(signedTx, [], { skipPreflight: true });
      setLoading(false);
      setMessage("Transaction confirmed", "success");
    } catch (err) {
      setLoading(false);
      setMessage(`Transaction failed: ${err.message}`, "error");
    }
  };

  return (
    <Flex flexDirection="column">
      <Flex
        padding="12px"
        borderRadius="6px"
        background={useColorMode(THEME.colors.backgroundAccent)}
      >
        <Image
          src={nft.tokenMetaUriData.image}
          style={{
            borderRadius: "6px",
            width: "100%",
          }}
        />
      </Flex>

      <Flex flexDirection="column" px={1} py={1}>
        <Text
          style={{
            fontSize: "20px",
            fontWeight: 600,
            lineHeight: "normal",
            margin: 0,
            color: useColorMode({
              light: THEME.colors.gray[700],
              dark: THEME.colors.gray[400],
            }),
          }}
        >
          {nft.tokenMetaUriData.name}
        </Text>
        <Flex alignItems="center">
          <Text
            style={{
              fontSize: "16px",
              fontWeight: 600,
              lineHeight: "normal",
              margin: 0,
              color: useColorMode({
                light: THEME.colors.gray[700],
                dark: THEME.colors.gray[400],
              }),
            }}
          >
            Pending rewards:&nbsp;
          </Text>
          <Text
            style={{
              fontSize: "14px",
              lineHeight: "normal",
              margin: 0,
              color: useColorMode({
                light: THEME.colors.gray[600],
                dark: THEME.colors.gray[500],
              }),
            }}
          >
            {pendingRewards || "0"} {symbol || ""}
          </Text>
        </Flex>

        <Flex alignItems="center">
          <Text
            style={{
              fontSize: "16px",
              fontWeight: 600,
              lineHeight: "normal",
              margin: 0,
              color: useColorMode({
                light: THEME.colors.gray[700],
                dark: THEME.colors.gray[400],
              }),
            }}
          >
            Description:&nbsp;
          </Text>
          <Text
            style={{
              fontSize: "14px",
              lineHeight: "normal",
              margin: 0,
              color: useColorMode({
                light: THEME.colors.gray[600],
                dark: THEME.colors.gray[500],
              }),
            }}
          >
            {nft.tokenMetaUriData.description}
          </Text>
        </Flex>
      </Flex>

      <Flex flexDirection="row" py={1} mt={1}>
        <Button
          style={{
            height: "48px",
            width: "100%",
            fontSize: "1em",
            fontWeight: 600,
            backgroundColor: hasRewards
              ? THEME.colors.green[400]
              : THEME.colors.green[200],
            color: THEME.colors.white,
            border: "none",
            borderRadius: "6px",
            marginBottom: "8px",
          }}
          onClick={hasRewards ? () => claimRewards() : () => {}}
        >
          {hasRewards ? `Claim rewards` : `No rewards to claim`}
          {txLoading && (
            <Loading
              style={{
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            />
          )}
        </Button>
      </Flex>
    </Flex>
  );
};
