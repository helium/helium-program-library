import { Keypair as HeliumKeypair } from "@helium/crypto";
import {
  init as initDataCredits
} from "@helium/data-credits-sdk";
import {
  init as initHeliumSubDaos
} from "@helium/helium-sub-daos-sdk";
import { Asset, AssetProof, toBN } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import chai from "chai";
import { changeMetadata, hotspotStorageKey, init as initHeliumEntityManager } from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { DC_FEE, ensureDCIdl, initTestHotspotConfig, initTestHotspotIssuer, initWorld } from "./utils/fixtures";
// @ts-ignore
import bs58 from "bs58";
const {expect} = chai;
// @ts-ignore
import animalHash from "angry-purple-tiger";
 
import { BN } from "bn.js";
import chaiAsPromised from 'chai-as-promised';
import { MerkleTree } from "../deps/solana-program-library/account-compression/sdk/src/merkle-tree";
import { computeCompressedNFTHash, getLeafAssetId, TokenProgramVersion, TokenStandard } from "@metaplex-foundation/mpl-bubblegum";

chai.use(chaiAsPromised);

describe("helium-entity-manager", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let subDao: PublicKey;

  beforeEach(async () => {
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

    hemProgram = await initHeliumEntityManager(
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
      await initTestHotspotConfig(hemProgram, provider, subDao);

    const account = await hemProgram.account.hotspotConfigV0.fetch(
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
      hemProgram,
      provider,
      subDao
    );
    const { hotspotIssuer, makerKeypair } = await initTestHotspotIssuer(
      hemProgram,
      provider,
      hotspotConfig
    );

    const account = await hemProgram.account.hotspotIssuerV0.fetch(
      hotspotIssuer
    );

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.count.toNumber()).eq(0);
    expect(account.maker.toBase58()).eq(makerKeypair.publicKey.toBase58());
  });

  describe("with issuer and data credits", () => {
    let makerKeypair: Keypair;
    let hotspotIssuer: PublicKey;
    let hotspotCollection: PublicKey;
    let startDcBal = DC_FEE * 10;
    let dcMint: PublicKey;

    beforeEach(async () => {
      const {
        dataCredits,
        hotspotConfig: hsConfig,
        issuer,
      } = await initWorld(provider, hemProgram, hsdProgram, dcProgram);
      await dcProgram.methods
        .mintDataCreditsV0({
          amount: toBN(DC_FEE*3, 8),
        })
        .accounts({ dcMint: dataCredits.dcMint })
        .rpc({ skipPreflight: true });

      hotspotIssuer = issuer.hotspotIssuer;
      makerKeypair = issuer.makerKeypair;
      hotspotCollection = hsConfig.collection;
      dcMint = dataCredits.dcMint;
    });

    it("issues a hotspot", async () => {
      const ecc = (await HeliumKeypair.makeRandom()).address.b58;
      const hotspotOwner = Keypair.generate().publicKey;

      const method = hemProgram.methods
        .issueHotspotV0({ hotspotKey: ecc, isFullHotspot: true })
        .accounts({
          hotspotIssuer,
          hotspotOwner,
          maker: makerKeypair.publicKey,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .signers([makerKeypair]);

      await method.rpc({ skipPreflight: true });

      const issuerAccount = await hemProgram.account.hotspotIssuerV0.fetch(
        hotspotIssuer
      );

      expect(issuerAccount.count.toNumber()).eq(1);
    });

    describe("with hotspot", () => {
      let hotspot: PublicKey;
      let hotspotOwner: Keypair;
      let hotspotConfig: PublicKey;
      let merkleTree: MerkleTree;
      let hKeypair: HeliumKeypair;
      let getAssetFn: (
        url: string,
        assetId: PublicKey
      ) => Promise<Asset | undefined>;
      let getAssetProofFn: (
        url: string,
        assetId: PublicKey
      ) => Promise<AssetProof | undefined>;

      beforeEach(async () => {
        hKeypair = await HeliumKeypair.makeRandom();
        const ecc = hKeypair.address.b58;
        hotspotOwner = Keypair.generate();

        const method = hemProgram.methods
          .issueHotspotV0({ hotspotKey: ecc, isFullHotspot: true })
          .accounts({
            hotspotIssuer,
            hotspotOwner: hotspotOwner.publicKey,
            maker: makerKeypair.publicKey,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 })
          ])
          .signers([makerKeypair]);

        await dcProgram.methods
          .mintDataCreditsV0({
            amount: toBN(startDcBal, 8),
          })
          .accounts({ dcMint, recipient: hotspotOwner.publicKey })
          .rpc();

        await method.rpc({ skipPreflight: true });

        // Setup merkle tree -- this isn't needed anywhere but localnet,
        // we're effectively duplicating metaplex digital asset api
        const merkle = (await method.pubkeys()).merkleTree!;
        hotspotConfig = (await method.pubkeys()).hotspotConfig!;
        hotspot = await getLeafAssetId(merkle, new BN(0));

        const leaves = Array(2 ** 3).fill(Buffer.alloc(32));
        const metadata = {
          name: animalHash(ecc).replace(/\s/g, "-").toLowerCase(),
          symbol: "HOTSPOT",
          uri: `https://mobile-metadata.test-helium.com/${ecc}`,
          collection: {
            key: hotspotCollection,
            verified: true,
          },
          creators: [],
          sellerFeeBasisPoints: 0,
          primarySaleHappened: true,
          isMutable: true,
          editionNonce: null,
          tokenStandard: TokenStandard.NonFungible,
          uses: null,
          tokenProgramVersion: TokenProgramVersion.Original,
        };
        const hash = computeCompressedNFTHash(
          hotspot,
          me,
          me,
          new anchor.BN(0),
          metadata
        );
        leaves[0] = hash;
        merkleTree = new MerkleTree(leaves);
        const proof = merkleTree.getProof(0);
        getAssetFn = async () => ({ content: metadata, ownership: { owner: hotspotOwner.publicKey } } as Asset);
        getAssetProofFn = async () => {
          return {
            root: new PublicKey(proof.root),
            proof: proof.proof.map((p) => new PublicKey(p)),
            nodeIndex: 0,
            leaf: new PublicKey(proof.leaf),
            treeId: merkle,
          };
        };
      });

      it("changes the metadata", async() => {
        const location = new BN(1000);
        const elevation = 100;
        const gain = 100;
        const hotspotConfig = (await hemProgram.account.hotspotIssuerV0.fetch(hotspotIssuer)).hotspotConfig;

        const method = (
          await changeMetadata({
            program: hemProgram,
            assetId: hotspot,
            hotspotConfig,
            location,
            elevation,
            gain,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([hotspotOwner]);

        const storage = (await method.pubkeys()).storage!;
        await method.rpc();

        const storageAcc = await hemProgram.account.hotspotStorageV0.fetch(storage!);
        expect(storageAcc.location?.toNumber()).to.eq(location.toNumber());
        expect(storageAcc.elevation).to.eq(elevation);
        expect(storageAcc.gain).to.eq(gain);
      });

      it("doesn't assert gain outside range", async() => {
        const method = (
          await changeMetadata({
            program: hemProgram,
            assetId: hotspot,
            location: null,
            elevation: null,
            gain: 1,
            hotspotConfig,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([hotspotOwner]);

        // @ts-ignore
        expect(method.rpc()).to.be.rejected;

        const method2 = (
          await changeMetadata({
            program: hemProgram,
            assetId: hotspot,
            location: null,
            elevation: null,
            gain: 1000,
            hotspotConfig,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([hotspotOwner]);

        // @ts-ignore
        expect(method2.rpc()).to.be.rejected;
      });
    });
  });
});
