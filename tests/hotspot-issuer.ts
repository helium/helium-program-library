import { expect } from "chai";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { toBN, execute, executeBig } from "@helium-foundation/spl-utils";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { HotspotIssuer } from "../target/types/hotspot_issuer";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URI =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

describe("hotspot-issuer", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const hntDecimals = 8;
  const program = anchor.workspace.HotspotIssuer as Program<HotspotIssuer>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  const random = (length = 10) => {
    // Declare all characters
    let chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    // Pick characers randomly
    let str = "";
    for (let i = 0; i < length; i++) {
      str += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return str;
  };

  const initTestHotspotIssuer = async (): Promise<{
    collection: PublicKey;
    hotspotIssuer: PublicKey;
    onboardingServer: PublicKey;
  }> => {
    const onboardingServer = Keypair.generate().publicKey;
    const method = await program.methods
      .initializeHotspotIssuerV0({
        authority: me,
        name: "HNT Mobile Hotspot",
        symbol: random(), // symbol is unique would need to restart localnet everytime
        uri: DEFAULT_METADATA_URI,
        dcAmount: toBN(50, hntDecimals),
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

    const account = await program.account.hotspotIssuerV0.fetch(hotspotIssuer);

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.onboardingServer.toBase58()).eq(onboardingServer.toBase58());
    expect(account.dcAmount.toString()).eq(toBN(50, hntDecimals).toString());
    expect(account.count.toNumber()).eq(0);
  });
});
