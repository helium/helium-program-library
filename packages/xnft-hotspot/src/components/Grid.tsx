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
import { getPendingRewards, useProgram, useTokenAccounts } from "../utils/index";
import { THEME } from "../utils/theme";
import * as anchor from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { init, recipientKey } from "@helium-foundation/lazy-distributor-sdk";

export function GridScreen() {
  const tokenAccounts = useTokenAccounts();

  if (tokenAccounts === null) {
    return <LoadingIndicator />;
  }
  return (
    <Grid
      tokenAccounts={tokenAccounts}
    />
  );
}

function Grid({ tokenAccounts }: any) {
  const publicKey = usePublicKey();
  const connection = useConnection();

  const claimAllRewards = async () => {
    //@ts-ignore
    const stubProvider = new anchor.AnchorProvider(connection, {publicKey}, anchor.AnchorProvider.defaultOptions())
    const program = await init(stubProvider);

    for (const nft of tokenAccounts) {
      //@ts-ignore
      const recipient = recipientKey(new PublicKey(nft.metadata.mint))[0];
      const recipientAcc = await program.account.recipientV0.fetch(recipient);
      const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(recipientAcc.lazyDistributor);
      const tx = await program.methods
        .distributeRewardsV0()
        .accounts({ 
          recipient, 
          lazyDistributor: recipientAcc.lazyDistributor, 
          rewardsMint: lazyDistributorAcc.rewardsMint 
        })
        .transaction();
      const { blockhash } = await connection!.getLatestBlockhash("recent");
      tx.recentBlockhash = blockhash;

      //@ts-ignore
      await window.xnft.send(tx);
    }
    
  };

  return (
    <View
      style={{
        marginRight: "10px",
        marginLeft: "10px",
        marginBottom: "38px",
      }}
    >
      <View
        style={{
          marginTop: "8px",
          display: "flex",
          justifyContent: "space-around",
        }}
      >
        {tokenAccounts.map((nft) => {
          return (
            <GridItem nft={nft} key={nft.metadata.mint}/>
          );
        })}
        <Button
          style={{
            height: "48px",
            width: "100%",
            fontSize: "1em",
            backgroundColor: THEME.colors.stake,
            color: '#000',
          }}
          onClick={() => claimAllRewards()}
        >
          Claim rewards
        </Button>
      </View>
    </View>
  );
}

function GridItem({ nft }) {
  const nav = useNavigation();
  
  const program = useProgram();

  const [pendingRewards, setPendingRewards] = useState<number | null>(null);
  const [interval, setNewInterval] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!program || !nft.metadata.mint) return null;
      const nftMint = new PublicKey(nft.metadata.mint);
      //@ts-ignore
      const recipient = recipientKey(nftMint)[0];
      const rewards = await getPendingRewards(program, recipient);
      setPendingRewards(rewards);
      if (interval) clearInterval(interval);
      const ivl = setInterval(async () => {
        const newRewards = await getPendingRewards(program, recipient);
        setPendingRewards(newRewards);
      }, 30000);
      setNewInterval(ivl);
    })();
    return () => clearInterval(interval);
  }, [program, nft])

  const clickNft = () => {
    nav.push("detail", { nft, pendingRewards });
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
            }}
          >
            {`Estimated rewards: ${pendingRewards || '0'}`}
          </Text>
        </View>
    </View>
  )
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
