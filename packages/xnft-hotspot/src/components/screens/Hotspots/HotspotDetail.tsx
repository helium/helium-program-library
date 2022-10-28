import React, { FC, useState } from "react";
import {
  usePublicKey,
  useConnection,
  View,
  Image,
  Text,
  Button,
  Loading,
} from "react-xnft";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { init } from "@helium-foundation/lazy-distributor-sdk";
import * as client from "@helium-foundation/distributor-oracle";
import ky from "ky";
import { THEME } from "../../../utils/theme";
import { LAZY_KEY } from "../../../utils";
import { useNotification } from "../../../contexts/notification";

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
  const publicKey = usePublicKey();
  const connection = useConnection();

  const [txLoading, setLoading] = useState<boolean>(false);
  const { setMessage } = useNotification();

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
    <View
      style={{
        marginRight: "20px",
        marginLeft: "20px",
      }}
    >
      <Image
        style={{
          marginBottom: "24px",
          display: "block",
          borderRadius: "6px",
          width: "335px",
          height: "335px",
          marginLeft: "auto",
          marginRight: "auto",
        }}
        src={nft.tokenMetaUriData.image}
      />
      <Text>
        Pending rewards: {pendingRewards || "0"} {symbol || ""}
      </Text>

      <Button
        style={{
          height: "48px",
          width: "100%",
          fontSize: "1em",
          backgroundColor: THEME.colors.green[400],
          color: "#000",
        }}
        onClick={() => claimRewards()}
      >
        Claim rewards{" "}
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
      <Text
        style={{
          color: THEME.colors.textSecondary,
        }}
      >
        Description
      </Text>
      <Text
        style={{
          color: THEME.colors.text,
          marginBottom: "10px",
        }}
      >
        {nft.tokenMetaUriData.description}
      </Text>
    </View>
  );
};
