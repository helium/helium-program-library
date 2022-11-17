import { execute, toBN } from "@helium/spl-utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import chai from "chai";
const {assert, expect} = chai;
import {
  init as initDataCredits
} from "@helium/data-credits-sdk";
import {
  init as initHeliumSubDaos
} from "@helium/helium-sub-daos-sdk";
import { hotspotCollectionKey, hotspotKey, init as initHeliumEntityManager } from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { DC_FEE, ensureDCIdl, initTestHotspotConfig, initTestHotspotIssuer, initWorld } from "./utils/fixtures";
import { initTestDao, initTestSubdao } from "./utils/daos";
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
describe("helium-entity-manager", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hsProgram: Program<HeliumEntityManager>;

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

    hsProgram = await initHeliumEntityManager(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
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
    let hotspotIssuer: PublicKey;
    let hotspotConfig: PublicKey;
    let startDcBal = DC_FEE * 10;
    let dcMint: PublicKey;

    before(async () => {
      const {
        dataCredits,
        hotspotConfig: hsConfig,
        issuer,
      } = await initWorld(provider, hsProgram, hsdProgram, dcProgram);
      await dcProgram.methods
        .mintDataCreditsV0({
          amount: toBN(DC_FEE*3, 8),
        })
        .accounts({ dcMint: dataCredits.dcMint })
        .rpc({ skipPreflight: true });

      hotspotIssuer = issuer.hotspotIssuer;
      makerKeypair = issuer.makerKeypair;
      hotspotConfig = hsConfig.hotspotConfig;
      dcMint = dataCredits.dcMint;
    });

    it("issues a hotspot", async () => {
      const ecc = (await HeliumKeypair.makeRandom()).address.publicKey;
      const hotspotOwner = Keypair.generate().publicKey;

      const method = hsProgram.methods
        .issueHotspotV0({ eccCompact: Buffer.from(ecc), uri: '', isFullHotspot: true })
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
      await method.rpc();

      const ata = await getAssociatedTokenAddress(hotspot!, hotspotOwner);
      const ataBal = await provider.connection.getTokenAccountBalance(ata);
      const issuerAccount = await hsProgram.account.hotspotIssuerV0.fetch(
        hotspotIssuer
      );

      expect(ataBal.value.uiAmount).eq(1);
      expect(issuerAccount.count.toNumber()).eq(1);
    });

    describe("with hotspot", () => {
      let hotspot: PublicKey;
      let hotspotOwner: Keypair;
      before(async () => {
        const ecc = (await HeliumKeypair.makeRandom()).address.publicKey;
        hotspotOwner = Keypair.generate();
  
        const method = hsProgram.methods
          .issueHotspotV0({ eccCompact: Buffer.from(ecc), uri: '', isFullHotspot: true })
          .accounts({
            hotspotIssuer,
            hotspotOwner: hotspotOwner.publicKey,
            maker: makerKeypair.publicKey,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 })
          ])
          .signers([makerKeypair]);
  
        const { hotspot: hsp } = await method.pubkeys();
        hotspot = hsp!;

        await method.rpc({ skipPreflight: true });

        await dcProgram.methods
          .mintDataCreditsV0({
            amount: toBN(startDcBal, 8),
          })
          .accounts({ dcMint, recipient: hotspotOwner.publicKey })
          .rpc();
      });

      it("changes the metadata", async() => {
        const location = 'abc';
        const elevation = 100;
        const gain = 100;
        const method = hsProgram.methods.changeMetadataV0({
          location,
          elevation,
          gain,
        }).accounts({
          hotspot,
          hotspotOwner: hotspotOwner.publicKey,
        }).signers([hotspotOwner]);
        const { storage } = await method.pubkeys();
        await method.rpc();

        const storageAcc = await hsProgram.account.hotspotStorageV0.fetch(storage!);
        assert.equal(storageAcc.location, location);
        assert.equal(storageAcc.elevation, elevation);
        assert.equal(storageAcc.gain, gain);
      });

      it("doesn't assert gain outside range", async() => {
        const method = hsProgram.methods.changeMetadataV0({
          location: null,
          elevation: null,
          gain: 1,
        }).accounts({
          hotspot,
          hotspotOwner: hotspotOwner.publicKey,
        }).signers([hotspotOwner]);

        expect(method.rpc()).to.be.rejected;

        const method2 = hsProgram.methods.changeMetadataV0({
          location: null,
          elevation: null,
          gain: 1000,
        }).accounts({
          hotspot,
          hotspotOwner: hotspotOwner.publicKey,
        }).signers([hotspotOwner]);

        expect(method2.rpc()).to.be.rejected
      });
    });

  });
});
