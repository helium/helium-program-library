import { execute, toBN } from "@helium/spl-utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  init as initDataCredits
} from "../packages/data-credits-sdk/src";
import {
  init as initHeliumSubDaos
} from "../packages/helium-sub-daos-sdk/src";
import { hotspotCollectionKey, hotspotKey, init as initHotspotIssuance } from "../packages/hotspot-issuance-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { DC_FEE, ensureDCIdl, initTestHotspotConfig, initTestHotspotIssuer, initWorld } from "./utils/fixtures";
import { initTestDao, initTestSubdao } from "./utils/daos";

describe("hotspot-issuance", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hsProgram: Program<HotspotIssuance>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let subDao: PublicKey;

  before(async () => {
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    ensureDCIdl(dcProgram);

    hsdProgram = await initHeliumSubDaos(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );

    hsProgram = await initHotspotIssuance(
      provider,
      anchor.workspace.HotspotIssuance.programId,
      anchor.workspace.HotspotIssuance.idl
    );

    const dao = await initTestDao(
      hsdProgram,
      provider,
      100,
      me
    );
    ({ subDao } = await initTestSubdao(
      hsdProgram,
      provider,
      me,
      dao.dao
    ))
  });

  it("initializes a hotspot config", async () => {
    const { hotspotConfig, collection, onboardingServerKeypair } =
      await initTestHotspotConfig(hsProgram, provider, subDao);

    const account = await hsProgram.account.hotspotConfigV0.fetch(
      hotspotConfig
    );

    expect(account.authority.toBase58()).eq(
      onboardingServerKeypair.publicKey.toBase58()
    );
    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.dcFee.toString()).eq(toBN(DC_FEE, 8).toString());
    expect(account.onboardingServer.toBase58()).eq(
      onboardingServerKeypair.publicKey.toBase58()
    );
  });

  it("initializes a hotspot issuer", async () => {
    const { hotspotConfig } = await initTestHotspotConfig(
      hsProgram,
      provider,
      subDao
    );
    const { hotspotIssuer, makerKeypair } = await initTestHotspotIssuer(
      hsProgram,
      provider,
      hotspotConfig
    );

    const account = await hsProgram.account.hotspotIssuerV0.fetch(
      hotspotIssuer
    );

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.count.toNumber()).eq(0);
    expect(account.maker.toBase58()).eq(makerKeypair.publicKey.toBase58());
  });

  describe("with issuer and data credits", () => {
    let makerKeypair: Keypair;
    let onboardingServerKeypair: Keypair;
    let hotspotIssuer: PublicKey;

    before(async () => {
      const {
        dataCredits,
        hotspotConfig: hsConfig,
        issuer,
      } = await initWorld(provider, hsProgram, hsdProgram, dcProgram);
      await dcProgram.methods
        .mintDataCreditsV0({
          amount: toBN(DC_FEE, 8),
        })
        .accounts({ dcMint: dataCredits.dcMint })
        .rpc({ skipPreflight: true });

      hotspotIssuer = issuer.hotspotIssuer;
      makerKeypair = issuer.makerKeypair;
      ({ onboardingServerKeypair } = hsConfig);
    });

    it("issues a hotspot", async () => {
      const ecc = await (await HeliumKeypair.makeRandom()).address.publicKey;
      const hotspotOwner = Keypair.generate().publicKey;
      const issuer = await hsProgram.account.hotspotIssuerV0.fetch(hotspotIssuer);
      const config = await hsProgram.account.hotspotConfigV0.fetch(issuer.hotspotConfig);

      const [keyShouldBe] = hotspotKey(config.collection, Buffer.from(ecc));
      console.log("Key sshould be", keyShouldBe.toBase58());

      const method = await hsProgram.methods
        .issueHotspotV0({ eccCompact: Buffer.from(ecc), uri: '' })
        .accounts({
          hotspotIssuer,
          hotspotOwner,
          maker: makerKeypair.publicKey,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 })
        ])
        .signers([makerKeypair]);

      const { hotspot } = await method.pubkeys();
      await method.rpc({ skipPreflight: true });

      const ata = await getAssociatedTokenAddress(hotspot!, hotspotOwner);
      const ataBal = await provider.connection.getTokenAccountBalance(ata);
      const issuerAccount = await hsProgram.account.hotspotIssuerV0.fetch(
        hotspotIssuer
      );

      expect(ataBal.value.uiAmount).eq(1);
      expect(issuerAccount.count.toNumber()).eq(1);
    });
  });
});
