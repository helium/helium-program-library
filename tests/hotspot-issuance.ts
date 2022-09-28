import { expect } from "chai";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { toBN, execute } from "@helium-foundation/spl-utils";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { issueHotspotInstructions } from "../packages/hotspot-issuance-sdk/src";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

describe("hotspot-issuance", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const hntDecimals = 8;
  const program = anchor.workspace.HotspotIssuance as Program<HotspotIssuance>;
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

  const initTestHotspotConfig = async (): Promise<{
    collection: PublicKey;
    hotspotConfig: PublicKey;
    onboardingServer: PublicKey;
  }> => {
    const onboardingServer = Keypair.generate().publicKey;
    const method = await program.methods
      .initializeHotspotConfigV0({
        name: "HNT Mobile Hotspot",
        symbol: random(), // symbol is unique would need to restart localnet everytime
        metadataUrl: DEFAULT_METADATA_URL,
        dcFee: toBN(50, hntDecimals),
        onboardingServer,
      })
      .accounts({
        payer: me,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      });

    const { collection, hotspotConfig } = await method.pubkeys();
    await method.rpc();

    return {
      collection: collection!,
      hotspotConfig: hotspotConfig!,
      onboardingServer,
    };
  };

  const initTestHotspotIssuer = async (
    hotspotConfig: PublicKey
  ): Promise<{
    hotspotIssuer: PublicKey;
    maker: PublicKey;
  }> => {
    const maker = Keypair.generate().publicKey;
    const method = await program.methods
      .initializeHotspotIssuerV0({
        maker,
        authority: me,
      })
      .accounts({
        payer: me,
        hotspotConfig,
      });

    const { hotspotIssuer } = await method.pubkeys();
    await method.rpc();

    return {
      hotspotIssuer: hotspotIssuer!,
      maker,
    };
  };

  it("initializes a hotspot config", async () => {
    const { hotspotConfig, collection, onboardingServer } =
      await initTestHotspotConfig();

    const account = await program.account.hotspotConfigV0.fetch(hotspotConfig);

    console.log(hotspotConfig.toBase58());
    console.log(account.collection.toBase58());
    expect(account.authority.toBase58()).eq(onboardingServer.toBase58());
    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.dcFee.toString()).eq(toBN(50, hntDecimals).toString());
    expect(account.onboardingServer.toBase58()).eq(onboardingServer.toBase58());
  });

  it("initializes a hotspot issuer", async () => {
    const { hotspotConfig } = await initTestHotspotConfig();
    const { hotspotIssuer, maker } = await initTestHotspotIssuer(hotspotConfig);

    const account = await program.account.hotspotIssuerV0.fetch(hotspotIssuer);

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.count.toNumber()).eq(0);
    expect(account.maker.toBase58()).eq(maker.toBase58());
  });

  describe("with hotspot issuer", async () => {
    it("issues a hotspot", async () => {
      const hotspotOwner = Keypair.generate().publicKey;
      const { hotspotConfig, collection } = await initTestHotspotConfig();
      const { hotspotIssuer, maker } = await initTestHotspotIssuer(
        hotspotConfig
      );

      const method = await program.methods
        .issueHotspotV0({
          maker,
          name: random(),
          symbol: "MOBILE",
          metadataUrl: DEFAULT_METADATA_URL,
        })
        .accounts({
          payer: me,
          dcFeePayer: me,
          hotspotOwner,
          collection,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        });

      const { recipient, hotspot } = await method.pubkeys();
      await method.rpc();

      console.log(`collection : ${collection!.toBase58()}`);
      console.log(`hotspot : ${hotspot!.toBase58()}`);
      console.log(`hotspotOwner : ${hotspotOwner.toBase58()}`);
      console.log(`recipient : ${recipient!.toBase58()}`);
    });
  });
});
