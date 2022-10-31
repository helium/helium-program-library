import React, { FC, useEffect } from "react";
import { Button, useNavigation, usePublicKey, useConnection } from "react-xnft";
import * as anchor from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { init } from "@helium/lazy-distributor-sdk";
import * as client from "@helium/distributor-oracle";
import ky from "ky";
import { HotspotGridItem } from "./HotspotGridItem";
import { LAZY_KEY, useTokenAccounts } from "../../../../utils/index";
import { THEME } from "../../../../utils/theme";
import { Flex, LoadingIndicator } from "../../../common";
import { useTitleColor } from "../../../../utils/hooks";

interface HotspotGridScreenProps {}

export const HotspotGridScreen: FC<HotspotGridScreenProps> = () => {
  useTitleColor();
  const tokenAccounts = useTokenAccounts();
  const nav = useNavigation();
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
    }
  };

  const clickSwap = () => {
    nav.push("swap", {});
  };

  return (
    <Flex flexDirection="column">
      <Flex flexWrap="wrap" gap={1} justifyContent="center" mb={2}>
        {tokenAccounts.map((nft) => (
          <HotspotGridItem key={nft.metadata.mint} nft={nft} />
        ))}
      </Flex>
      <Flex justifyContent="center" width="100%" mb={2} py={1}>
        <Button
          style={{
            height: "48px",
            width: "100%",
            fontSize: "1em",
            fontWeight: 600,
            backgroundColor: THEME.colors.green[400],
            color: THEME.colors.white,
            border: "none",
            borderRadius: "6px",
          }}
          onClick={() => claimAllRewards()}
        >
          Claim all rewards
        </Button>
      </Flex>
    </Flex>
  );
};
