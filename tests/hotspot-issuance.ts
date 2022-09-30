import { expect } from "chai";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { toBN } from "@helium-foundation/spl-utils";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { init } from "../packages/hotspot-issuance-sdk/src";
import { PROGRAM_ID } from "../packages/hotspot-issuance-sdk/src/constants";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

const random = (length = 10) => {
  // Declare all characters
  let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  // Pick characers randomly
  let str = "";
  for (let i = 0; i < length; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return str;
};

describe("hotspot-issuance", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<HotspotIssuance>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const hntDecimals = 8;

  before(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.HotspotIssuance.idl
    );
  });

  const initTestHotspotConfig = async (): Promise<{
    collection: PublicKey;
    hotspotConfig: PublicKey;
    onboardingServerKeypair: Keypair;
  }> => {
    const onboardingServerKeypair = Keypair.generate();
    const method = await program.methods
      .initializeHotspotConfigV0({
        name: "Helium Network Hotspots",
        symbol: random(), // symbol is unique would need to restart localnet everytime
        metadataUrl: DEFAULT_METADATA_URL,
        dcFee: toBN(50, hntDecimals),
        onboardingServer: onboardingServerKeypair.publicKey,
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
      onboardingServerKeypair,
    };
  };

  const initTestHotspotIssuer = async (
    hotspotConfig: PublicKey
  ): Promise<{
    hotspotIssuer: PublicKey;
    makerKeypair: Keypair;
  }> => {
    const makerKeypair = Keypair.generate();
    const method = await program.methods
      .initializeHotspotIssuerV0({
        maker: makerKeypair.publicKey,
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
      makerKeypair,
    };
  };

  it("initializes a hotspot config", async () => {
    const { hotspotConfig, collection, onboardingServerKeypair } =
      await initTestHotspotConfig();

    const account = await program.account.hotspotConfigV0.fetch(hotspotConfig);

    expect(account.authority.toBase58()).eq(
      onboardingServerKeypair.publicKey.toBase58()
    );
    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.dcFee.toString()).eq(toBN(50, hntDecimals).toString());
    expect(account.onboardingServer.toBase58()).eq(
      onboardingServerKeypair.publicKey.toBase58()
    );
  });

  it("initializes a hotspot issuer", async () => {
    const { hotspotConfig } = await initTestHotspotConfig();
    const { hotspotIssuer, makerKeypair } = await initTestHotspotIssuer(
      hotspotConfig
    );

    const account = await program.account.hotspotIssuerV0.fetch(hotspotIssuer);

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.count.toNumber()).eq(0);
    expect(account.maker.toBase58()).eq(makerKeypair.publicKey.toBase58());
  });

  describe("with hotspot issuer", async () => {
    it("issues a hotspot", async () => {
      const hotspotOwner = Keypair.generate().publicKey;
      const { hotspotConfig, collection, onboardingServerKeypair } =
        await initTestHotspotConfig();

      const { hotspotIssuer, makerKeypair } = await initTestHotspotIssuer(
        hotspotConfig
      );

      const method = await program.methods
        .issueHotspotV0({
          name: "Helium Network Hotspot",
          symbol: "MOBILE",
          metadataUrl: DEFAULT_METADATA_URL,
        })
        .accounts({
          payer: me,
          dcFeePayer: me,
          onboardingServer: onboardingServerKeypair.publicKey,
          maker: makerKeypair.publicKey,
          hotspotOwner: hotspotOwner,
          collection,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([onboardingServerKeypair, makerKeypair]);

      const { hotspot } = await method.pubkeys();

      await method.rpc();

      const ata = await getAssociatedTokenAddress(hotspot!, hotspotOwner);
      const ataBal = await provider.connection.getTokenAccountBalance(ata);
      const issuerAccount = await program.account.hotspotIssuerV0.fetch(
        hotspotIssuer
      );

      expect(ataBal.value.uiAmount).eq(1);
      expect(issuerAccount.count.toNumber()).eq(1);
    });
  });
});
