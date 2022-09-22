import { assert } from "chai";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { execute, executeBig } from "@helium-foundation/spl-utils";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { createAtaAndMint, createMint, mintTo } from "./utils/token";
import { HotspotIssuer } from "../target/types/hotspot_issuer";
import {
  hotspotIssuerKey,
  collectionMetadataKey,
  initializeHotspotIssuerInstructions,
} from "../packages/hotspot-issuer-sdk/src";
import { BN } from "bn.js";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URI =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

describe("hotspot-issuer", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = anchor.workspace.HotspotIssuer as Program<HotspotIssuer>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  const initTestHotspotIssuer = async (): Promise<{
    collection: PublicKey;
    hotspotIssuer: PublicKey;
    onboardingServer: PublicKey;
  }> => {
    const onboardingServer = Keypair.generate().publicKey;
    const method = await program.methods
      .initializeHotspotIssuerV0({
        authority: me,
        name: "HNT Mobile Hotspots",
        symbol: "HNTMOBILE",
        uri: DEFAULT_METADATA_URI,
        onboardingServer,
      })
      .accounts({
        payer: me,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      });

    const { collection, hotspotIssuer } = await method.pubkeys();
    await method.rpc();

    return {
      collection: collection!,
      hotspotIssuer: hotspotIssuer!,
      onboardingServer,
    };
  };

  it("initializes hotspot issuer", async () => {
    const { hotspotIssuer, collection, onboardingServer } =
      await initTestHotspotIssuer();

    const hotspotIssuerAcc = await program.account.hotspotIssuerV0.fetch(
      hotspotIssuer
    );

    assert(hotspotIssuerAcc?.authority.equals(me));
    assert(hotspotIssuerAcc?.collection.equals(collection));
    assert(hotspotIssuerAcc?.onboardingServer.equals(onboardingServer));
    assert(hotspotIssuerAcc?.count.toNumber() == 0);
  });
});
