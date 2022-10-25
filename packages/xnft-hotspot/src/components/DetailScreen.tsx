import {
  usePublicKey,
  useConnection,
  View,
  Image,
  Text,
  Button,
  Tab,
  List,
  ListItem,
} from "react-xnft";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { THEME } from "../utils/theme";
import { init, recipientKey } from "@helium-foundation/lazy-distributor-sdk";

export function DetailScreen({ nft, pendingRewards, symbol }) {
  const publicKey = usePublicKey();
  const connection = useConnection();
  
  const claimRewards = async () => {
    //@ts-ignore
    const stubProvider = new anchor.AnchorProvider(connection, {publicKey}, anchor.AnchorProvider.defaultOptions())
    const program = await init(stubProvider);
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
    await window.xnft.solana.send(tx);
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
        Pending rewards: {pendingRewards || '0'} {symbol || ''}
      </Text>
      
      <Button
        style={{
          height: "48px",
          width: "100%",
          fontSize: "1em",
          backgroundColor: THEME.colors.stake,
          color: '#000',
        }}
        onClick={() => claimRewards()}
      >
        Claim rewards
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

      <View>
        <DetailsScreen nft={nft} />
      </View>
    </View>
  );
}


function DetailsScreen({ nft }) {
  return (
    <View
      style={{
        marginTop: "12px",
        minHeight: "281px",
      }}
    >
      <List
        style={{
          backgroundColor: THEME.colors.attributeBackground,
        }}
      >
        <DetailListItem
          title={"Mint address"}
          value={nft.metadata.mint.toString()}
        />
        <DetailListItem
          title={"Token address"}
          value={nft.publicKey.toString()}
        />
        <DetailListItem
          title={"Metadata address"}
          value={nft.metadataAddress.toString()}
        />
        <DetailListItem
          title={"Update authority"}
          value={nft.metadata.updateAuthority.toString()}
        />
      </List>
    </View>
  );
}

function DetailListItem({ title, value }) {
  return (
    <ListItem
      style={{
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
        padding: "12px",
      }}
    >
      <Text
        style={{
          color: THEME.colors.text,
          fontSize: "14px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: THEME.colors.textSecondary,
          fontSize: "14px",
          flexDirection: "column",
          justifyContent: "center",
          textOverflow: "ellipsis",
          width: "138px",
          overflow: "hidden",
          display: "block",
        }}
      >
        {value}
      </Text>
    </ListItem>
  );
}
