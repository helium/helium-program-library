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
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";

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
  const nav = useNavigation();
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
          flexWrap: 'wrap',
        }}
      >
        {tokenAccounts.map((nft) => {
          return (
            <GridItem nft={nft} key={nft.metadata.mint}/>
          );
        })}
      </View>
      <Button
        style={{
          height: "48px",
          width: "80%",
          marginLeft: '10%',
          fontSize: "1em",
          backgroundColor: THEME.colors.stake,
          color: '#000',
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
  const nav = useNavigation();
  
  const program = useProgram();

  const [rewardsMint, setRewardsMint] = useState<PublicKey | null>(null);
  const [pendingRewards, setPendingRewards] = useState<number | null>(null);
  const [interval, setNewInterval] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!program || !nft.metadata.mint) return null;
      const nftMint = new PublicKey(nft.metadata.mint);
      //@ts-ignore
      const recipient = recipientKey(nftMint)[0];
      const {pendingRewards: rewards, rewardsMint: rwdMint} = await getPendingRewards(program, recipient);
      setPendingRewards(rewards);
      setRewardsMint(rwdMint);
      if (interval) clearInterval(interval);
      const ivl = setInterval(async () => {
        const {pendingRewards: newRewards} = await getPendingRewards(program, recipient);
        setPendingRewards(newRewards);
      }, 30000);
      setNewInterval(ivl);
    })();
    return () => clearInterval(interval);
  }, [program, nft])

  const [symbol, setSymbol] = useState<string>('');
  useEffect(() => {
    if (!rewardsMint) return;
    (async() => {
      const metadata = PublicKey.findProgramAddressSync([
        Buffer.from("metadata", "utf-8"), MPL_PID.toBuffer(), rewardsMint.toBuffer()
        ],
        MPL_PID
      )[0];
      //@ts-ignore
      const acc = await window.xnft.connection.getAccountInfo(metadata);
      const meta = Metadata.fromAccountInfo(acc)[0];
      setSymbol(meta.data.symbol);
    })()
  }, [rewardsMint])

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
            {`Rewards: ${pendingRewards || '0'} ${symbol || ''}`}
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
