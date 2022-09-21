import { assert } from "chai";
import anchor, { Program } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { execute, executeBig } from "@helium-foundation/spl-utils";
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

  let collectionKey: PublicKey;
  let onboardingServerKey: PublicKey;
  let hotspotIssuerPDA: PublicKey;
  let metadataPDA: PublicKey;

  before(async () => {
    collectionKey = Keypair.generate().publicKey;
    onboardingServerKey = Keypair.generate().publicKey;
    hotspotIssuerPDA = hotspotIssuerKey({ collection: collectionKey })[0];
    metadataPDA = collectionMetadataKey({ collection: collectionKey })[0];

    await program.methods
      .initializeHotspotIssuerV0({
        name: "HNT Mobile Hotspots",
        symbol: "HNTMOBILE",
        uri: DEFAULT_METADATA_URI,
        onboardingServer: onboardingServerKey,
        authority: me,
      })
      .accounts({
        payer: me,
      })
      .rpc();
  });

  it("initializes hotspot issuer", async () => {
    const hotspotIssuerAcc = await program.account.hotspotIssuerV0.fetch(
      hotspotIssuerPDA
    );

    assert(hotspotIssuerAcc?.authority.equals(me));
    assert(hotspotIssuerAcc?.collection.equals(collectionKey));
    assert(hotspotIssuerAcc?.onboardingServer.equals(onboardingServerKey));
    assert(hotspotIssuerAcc?.count.toNumber() == 0);
  });
});
