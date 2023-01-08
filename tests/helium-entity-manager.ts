import { Keypair as HeliumKeypair } from "@helium/crypto";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { Asset, AssetProof, toBN } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { ComputeBudgetProgram, PublicKey, Keypair } from "@solana/web3.js";
import chai from "chai";
import {
  updateMetadata,
  init as initHeliumEntityManager,
} from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  DC_FEE,
  ensureHSDIdl,
  ensureDCIdl,
  initTestRewardableEntityConfig,
  initTestMaker,
  initWorld,
} from "./utils/fixtures";
// @ts-ignore
import bs58 from "bs58";
const { expect } = chai;
// @ts-ignore
import animalHash from "angry-purple-tiger";

import { BN } from "bn.js";
import chaiAsPromised from "chai-as-promised";
import { MerkleTree } from "../deps/solana-program-library/account-compression/sdk/src/merkle-tree";
import {
  computeCompressedNFTHash,
  getLeafAssetId,
  TokenProgramVersion,
  TokenStandard,
} from "@metaplex-foundation/mpl-bubblegum";

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

    ensureHSDIdl(hsdProgram);

    hemProgram = await initHeliumEntityManager(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );

    const dao = await initTestDao(hsdProgram, provider, 100, me);
    ({ subDao } = await initTestSubdao(hsdProgram, provider, me, dao.dao));
  });

  it("initializes a rewardable entity config", async () => {
    const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
      hemProgram,
      provider,
      subDao
    );

    const account = await hemProgram.account.rewardableEntityConfigV0.fetch(
      rewardableEntityConfig
    );

    expect(account.authority.toBase58()).eq(
      provider.wallet.publicKey.toBase58()
    );
  });

  it("initializes a maker", async () => {
    const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
      hemProgram,
      provider,
      subDao
    );

    const { maker, collection, makerKeypair } = await initTestMaker(
      hemProgram,
      provider,
      rewardableEntityConfig
    );

    const account = await hemProgram.account.makerV0.fetch(maker);

    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.authority.toBase58()).eq(makerKeypair.publicKey.toBase58());
  });

  describe("with maker and data credits", () => {
    let makerKeypair: Keypair;
    let maker: PublicKey;
    let startDcBal = DC_FEE * 10;
    let dcMint: PublicKey;

    let merkleTree: MerkleTree;
    let getAssetFn: (
      url: string,
      assetId: PublicKey
    ) => Promise<Asset | undefined>;
    let getAssetProofFn: (
      url: string,
      assetId: PublicKey
    ) => Promise<AssetProof | undefined>;
    let hotspotCollection: PublicKey;
    let rewardableEntityConfig: PublicKey;
    let ecc: String;
    let hotspot: PublicKey;
    let hotspotOwner = Keypair.generate();
    let metadata: any;
    let anchorAppropriateMetadata: any;

    beforeEach(async () => {
      ecc = (await HeliumKeypair.makeRandom()).address.b58;

      const {
        dataCredits,
        rewardableEntityConfig: rewardableEntityConfigInfo,
        maker: makerConf,
      } = await initWorld(provider, hemProgram, hsdProgram, dcProgram);
      await dcProgram.methods
        .mintDataCreditsV0({
          hntAmount: toBN(DC_FEE * 3, 8),
        })
        .accounts({ dcMint: dataCredits.dcMint })
        .rpc({ skipPreflight: true });

      maker = makerConf.maker;
      makerKeypair = makerConf.makerKeypair;
      hotspotCollection = makerConf.collection;
      dcMint = dataCredits.dcMint;

      // Setup merkle tree -- this isn't needed anywhere but localnet,
      // we're effectively duplicating metaplex digital asset api
      const merkle = makerConf.merkle;
      rewardableEntityConfig =
        rewardableEntityConfigInfo.rewardableEntityConfig;
      hotspot = await getLeafAssetId(merkle, new BN(0));

      const leaves = Array(2 ** 3).fill(Buffer.alloc(32));
      metadata = {
        name: animalHash(ecc).replace(/\s/g, "-").toLowerCase(),
        symbol: "HOTSPOT",
        uri: `https://iot-metadata.oracle.test-helium.com/${ecc}`,
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
      anchorAppropriateMetadata = {
        ...metadata,
        tokenStandard: { nonFungible: {} },
        tokenProgramVersion: { original: {} },
      };
      const hash = computeCompressedNFTHash(
        hotspot,
        hotspotOwner.publicKey,
        hotspotOwner.publicKey,
        new anchor.BN(0),
        metadata
      );
      leaves[0] = hash;
      merkleTree = new MerkleTree(leaves);
      const proof = merkleTree.getProof(0);
      getAssetFn = async () =>
        ({
          content: metadata,
          ownership: { owner: hotspotOwner.publicKey },
        } as Asset);
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

    it("issues an iot hotspot", async () => {
      const ecc = (await HeliumKeypair.makeRandom()).address.b58;

      await hemProgram.methods
        .issueEntityV0({
          entityKey: ecc,
        })
        .accounts({
          maker,
          recipient: hotspotOwner.publicKey,
          authority: makerKeypair.publicKey,
        })
        .signers([makerKeypair])
        .rpc({ skipPreflight: true });
      const method = hemProgram.methods
        .onboardIotHotspotV0({
          root: merkleTree.getRoot().toJSON().data,
          index: 0,
          metadata: anchorAppropriateMetadata,
        })
        .accounts({
          maker,
          rewardableEntityConfig,
          authority: makerKeypair.publicKey,
          hotspotOwner: hotspotOwner.publicKey
        })
        .remainingAccounts(
          merkleTree.getProof(0).proof.map(p => ({
            pubkey: new PublicKey(p),
            isWritable: false,
            isSigner: false
          }))
        )
        .signers([makerKeypair, hotspotOwner]);

      await method.rpc({ skipPreflight: true });
      console.log("stop");
      const { iotInfo } = await method.pubkeys();

      const iotInfoAccount = await hemProgram.account.iotHotspotInfoV0.fetch(
        iotInfo!
      );
      expect(iotInfoAccount.hotspotKey).to.eq(ecc);
    });

    it("updates entity config", async () => {
      const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        provider,
        subDao
      );

      await hemProgram.methods
        .updateRewardableEntityConfigV0({
          newAuthority: PublicKey.default,
        })
        .accounts({
          rewardableEntityConfig,
        })
        .rpc();

      const acc = await hemProgram.account.rewardableEntityConfigV0.fetch(
        rewardableEntityConfig
      );
      expect(acc.authority.toBase58()).to.equal(PublicKey.default.toBase58());
    });

    describe("with hotspot", () => {
      let hotspot: PublicKey;
      let hotspotOwner: Keypair;
      let rewardableEntityConfig: PublicKey;
      let hKeypair: HeliumKeypair;

      beforeEach(async () => {
        hKeypair = await HeliumKeypair.makeRandom();
        const ecc = hKeypair.address.b58;
        hotspotOwner = Keypair.generate();

        await hemProgram.methods
          .issueEntityV0({
            entityKey: ecc,
          })
          .accounts({
            maker: makerKeypair.publicKey,
            recipient: hotspotOwner.publicKey,
            authority: makerKeypair.publicKey,
          })
          .signers([makerKeypair])
          .rpc({ skipPreflight: true });
        const method = hemProgram.methods
          .onboardIotHotspotV0({
            root: merkleTree.getRoot().toJSON().data,
            index: 0,
            metadata: anchorAppropriateMetadata,
          })
          .accounts({
            maker,
            authority: makerKeypair.publicKey,
            rewardableEntityConfig,
            hotspotOwner: hotspotOwner.publicKey,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
          ])
          .signers([makerKeypair, hotspotOwner]);

        await dcProgram.methods
          .mintDataCreditsV0({
            hntAmount: toBN(startDcBal, 8),
          })
          .accounts({ dcMint, recipient: hotspotOwner.publicKey })
          .rpc();

        await method.rpc({ skipPreflight: true });
      });

      it("updates maker", async () => {
        await hemProgram.methods
          .updateMakerV0({
            maker: PublicKey.default,
            authority: PublicKey.default,
          })
          .accounts({
            maker,
          })
          .rpc();

        const acc = await hemProgram.account.makerV0.fetch(maker);
        expect(acc.authority.toBase58()).to.eq(PublicKey.default.toBase58());
        expect(acc.maker.toBase58()).to.eq(PublicKey.default.toBase58());
      });

      it("changes the metadata", async () => {
        const location = new BN(1000);
        const elevation = 100;
        const gain = 100;
        const rewardableEntityConfig = (
          await hemProgram.account.makerV0.fetch(maker)
        ).rewardableEntityConfig;

        const method = (
          await updateMetadata({
            program: hemProgram,
            assetId: hotspot,
            rewardableEntityConfig,
            location,
            elevation,
            gain,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([hotspotOwner]);

        const info = (await method.pubkeys()).info!;
        await method.rpc({ skipPreflight: true });

        const storageAcc = await hemProgram.account.iotHotspotInfoV0.fetch(
          info!
        );
        expect(storageAcc.location?.toNumber()).to.eq(location.toNumber());
        expect(storageAcc.elevation).to.eq(elevation);
        expect(storageAcc.gain).to.eq(gain);
      });

      it("doesn't assert gain outside range", async () => {
        const method = (
          await updateMetadata({
            program: hemProgram,
            assetId: hotspot,
            location: null,
            elevation: null,
            gain: 1,
            rewardableEntityConfig,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([hotspotOwner]);

        // @ts-ignore
        expect(method.rpc()).to.be.rejected;

        const method2 = (
          await updateMetadata({
            program: hemProgram,
            assetId: hotspot,
            location: null,
            elevation: null,
            gain: 1000,
            rewardableEntityConfig,
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
