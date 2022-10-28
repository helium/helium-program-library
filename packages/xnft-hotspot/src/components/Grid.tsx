import React from "react";
import {
  useNavigation,
  View,
  Image,
  Text,
  Button,
  Loading,
  usePublicKey,
  useConnection,
} from "react-xnft";
import { useState, useEffect } from "react";
import {
  getPendingRewards,
  LAZY_KEY,
  useProgram,
  useTokenAccounts,
} from "../utils/index";
import { THEME } from "../utils/theme";
import * as anchor from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { init } from "@helium-foundation/lazy-distributor-sdk";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import * as client from "@helium-foundation/distributor-oracle";
import ky from "ky";

export function GridScreen() {
  const tokenAccounts = useTokenAccounts();

  if (tokenAccounts === null) {
    return <LoadingIndicator />;
  }
  return <Grid tokenAccounts={tokenAccounts} />;
}

function Grid({ tokenAccounts }: any) {
  const nav = useNavigation();
  const publicKey = usePublicKey();
  const connection = useConnection();

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
    <View
      style={{
        marginBottom: "38px",
      }}
    >
      <View
        style={{
          marginTop: "8px",
          display: "flex",
          justifyContent: "space-around",
          flexWrap: "wrap",
        }}
      >
        {tokenAccounts.map((nft) => {
          return <GridItem nft={nft} key={nft.metadata.mint} />;
        })}
      </View>
      <Button
        style={{
          height: "48px",
          width: "80%",
          marginLeft: '10%',
          fontSize: "1em",
          backgroundColor: THEME.colors.stake,
          color: "#000",
        }}
        onClick={() => claimAllRewards()}
      >
        Claim all rewards
      </Button>

      <Button
        style={{
          marginTop: '20px',
          height: "48px",
          width: "80%",
          marginLeft: "10%",
          fontSize: "1em",
          backgroundColor: THEME.colors.stake,
          color: '#000',
        }}
        onClick={() => clickSwap()}
      >
        Swap
      </Button>
    </View>
  );
}

function GridItem({ nft }) {
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

  return (
    <View>
      <Button
        onClick={() => clickNft()}
        style={{
          padding: 0,
          width: "157.5px",
          height: "157.5px",
          borderRadius: "6px",
        }}
      >
        <Image
          src={nft.tokenMetaUriData.image}
          style={{
            borderRadius: "6px",
            width: "157.5px",
          }}
        />
      </Button>
      <View
        style={{
          marginTop: "3px",
          display: "block",
        }}
      >
        <Text
          style={{
            fontSize: "12px",
            lineHeight: "19.08px",
            color: 'white',
          }}
        >
          {nft.tokenMetaUriData.name}
        </Text>
      </View>
      <View>
        <Text
          style={{
            fontSize: "12px",
            lineHeight: "19.08px",
            color: 'white',
          }}
        >
          {`Rewards: ${pendingRewards || "0"} ${symbol || ""}`}
        </Text>
      </View>
    </View>
  );
}

function LoadingIndicator() {
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        height: "100%",
      }}
    >
      <Loading
        style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
      />
    </View>
  );
}
