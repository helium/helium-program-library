import { Keypair as HeliumKeypair } from "@helium/crypto";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { Asset, AssetProof, toBN } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import chai from "chai";
import {
  init as initHeliumEntityManager,
  onboardIotHotspot,
  onboardMobileHotspot, updateIotMetadata, updateMobileMetadata
} from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  DC_FEE, ensureDCIdl, ensureHSDIdl, initTestDataCredits, initTestMaker, initTestRewardableEntityConfig
} from "./utils/fixtures";
// @ts-ignore
import bs58 from "bs58";
const { expect } = chai;
// @ts-ignore
import animalHash from "angry-purple-tiger";

import {
  computeCompressedNFTHash,
  getLeafAssetId,
  TokenProgramVersion,
  TokenStandard
} from "@metaplex-foundation/mpl-bubblegum";
import { BN } from "bn.js";
import chaiAsPromised from "chai-as-promised";
import { MerkleTree } from "../deps/solana-program-library/account-compression/sdk/src/merkle-tree";

chai.use(chaiAsPromised);

describe("helium-entity-manager", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let dao: PublicKey;
  let subDao: PublicKey;
  let dcMint: PublicKey;

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

    const dataCredits = await initTestDataCredits(dcProgram, provider);
    dcMint = dataCredits.dcMint;
    ({ dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint
    ));
    ({ subDao } = await initTestSubdao(hsdProgram, provider, me, dao));
  });

  it("initializes a rewardable entity config", async () => {
    const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
      hemProgram,
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
      subDao
    );

    const { maker, collection, makerKeypair } = await initTestMaker(
      hemProgram,
      provider,
      rewardableEntityConfig
    );

    const account = await hemProgram.account.makerV0.fetch(maker);

    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.issuingAuthority.toBase58()).eq(
      makerKeypair.publicKey.toBase58()
    );
    expect(account.updateAuthority.toBase58()).eq(
      makerKeypair.publicKey.toBase58()
    );
  });

  describe("with mobile maker and data credits", () => {
    let makerKeypair: Keypair;
    let maker: PublicKey;
    let startDcBal = DC_FEE * 10;

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
    let ecc: string;
    let hotspot: PublicKey;
    let hotspotOwner = Keypair.generate();
    let metadata: any;
    beforeEach(async () => {
      ecc = (await HeliumKeypair.makeRandom()).address.b58;

      ({ rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        subDao,
        {
          mobileConfig: {
            fullLocationStakingFee: toBN(1000000, 0),
            dataonlyLocationStakingFee: toBN(500000, 0),
          },
        }
      ));
      const makerConf = await initTestMaker(
        hemProgram,
        provider,
        rewardableEntityConfig
      );

      await initTestMaker(hemProgram, provider, rewardableEntityConfig);

      await dcProgram.methods
        .mintDataCreditsV0({
          hntAmount: toBN(startDcBal, 8),
        })
        .accounts({ dcMint: dcMint })
        .rpc({ skipPreflight: true });

      maker = makerConf.maker;
      makerKeypair = makerConf.makerKeypair;
      hotspotCollection = makerConf.collection;

      // Setup merkle tree -- this isn't needed anywhere but localnet,
      // we're effectively duplicating metaplex digital asset api
      const merkle = makerConf.merkle;
      hotspot = await getLeafAssetId(merkle, new BN(0));

      const leaves = Array(2 ** 3).fill(Buffer.alloc(32));

      metadata = {
        name: animalHash(ecc).replace(/\s/g, "-").toLowerCase().slice(0, 32),
        symbol: "HOTSPOT",
        uri: `https://metadata.oracle.test-helium.com/${ecc}`,
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
          id: await getLeafAssetId(merkle, new BN(0)),
          content: {
            metadata: {
              name: metadata.name,
              symbol: metadata.symbol,
            },
            json_uri: metadata.uri,
          },
          royalty: {
            basis_points: metadata.sellerFeeBasisPoints,
            primary_sale_happened: true,
          },
          mutable: true,
          supply: {
            edition_nonce: null,
          },
          grouping: metadata.collection.key,
          uses: metadata.uses,
          creators: metadata.creators,
          ownership: { owner: hotspotOwner.publicKey },
          compression: {
            compressed: true,
            eligible: true,
          },
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

    it("issues a mobile hotspot", async () => {
      await hemProgram.methods
        .issueEntityV0({
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .accounts({
          maker,
          recipient: hotspotOwner.publicKey,
          issuingAuthority: makerKeypair.publicKey,
          dao
        })
        .signers([makerKeypair])
        .rpc({ skipPreflight: true });

      const method = (
        await onboardMobileHotspot({
          program: hemProgram,
          assetId: hotspot,
          maker,
          dao,
          rewardableEntityConfig,
          getAssetFn,
          getAssetProofFn,
        })
      ).signers([makerKeypair, hotspotOwner]);

      await method.rpc({ skipPreflight: true });
      const { mobileInfo } = await method.pubkeys();

      const mobileInfoAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
        mobileInfo!
      );
      expect(Boolean(mobileInfoAcc)).to.be.true;
    });

    describe("with hotspot", () => {
      beforeEach(async () => {
        await hemProgram.methods
          .issueEntityV0({
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .accounts({
            maker,
            dao,
            recipient: hotspotOwner.publicKey,
            issuingAuthority: makerKeypair.publicKey,
          })
          .signers([makerKeypair])
          .rpc({ skipPreflight: true });

        const method = (
          await onboardMobileHotspot({
            program: hemProgram,
            assetId: hotspot,
            maker,
            dao,
            rewardableEntityConfig,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([makerKeypair, hotspotOwner]);

        await method.rpc({ skipPreflight: true });

        await dcProgram.methods
          .mintDataCreditsV0({
            hntAmount: toBN(startDcBal, 8),
          })
          .accounts({ dcMint, recipient: hotspotOwner.publicKey })
          .rpc();
      });

      it("changes the metadata", async () => {
        const location = new BN(1000);

        const method = (
          await updateMobileMetadata({
            program: hemProgram,
            assetId: hotspot,
            rewardableEntityConfig,
            location,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([hotspotOwner]);

        const info = (await method.pubkeys()).mobileInfo!;
        await method.rpc({ skipPreflight: true });

        const storageAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
          info!
        );
        expect(storageAcc.location?.toNumber()).to.eq(location.toNumber());
      });
    });
  });

  describe("with iot maker and data credits", () => {
    let makerKeypair: Keypair;
    let maker: PublicKey;
    let startDcBal = DC_FEE * 10;

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
    let ecc: string;
    let hotspot: PublicKey;
    let hotspotOwner = Keypair.generate();
    let metadata: any;

    beforeEach(async () => {
      ecc = (await HeliumKeypair.makeRandom()).address.b58;

      ({ rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        subDao
      ));
      const makerConf = await initTestMaker(
        hemProgram,
        provider,
        rewardableEntityConfig
      );

      await initTestMaker(hemProgram, provider, rewardableEntityConfig);

      await dcProgram.methods
        .mintDataCreditsV0({
          hntAmount: toBN(startDcBal, 8),
        })
        .accounts({ dcMint: dcMint })
        .rpc({ skipPreflight: true });

      maker = makerConf.maker;
      makerKeypair = makerConf.makerKeypair;
      hotspotCollection = makerConf.collection;

      // Setup merkle tree -- this isn't needed anywhere but localnet,
      // we're effectively duplicating metaplex digital asset api
      const merkle = makerConf.merkle;
      hotspot = await getLeafAssetId(merkle, new BN(0));

      const leaves = Array(2 ** 3).fill(Buffer.alloc(32));
      metadata = {
        name: animalHash(ecc).replace(/\s/g, "-").toLowerCase().slice(0, 32),
        symbol: "HOTSPOT",
        uri: `https://metadata.oracle.test-helium.com/${ecc}`,
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
          id: await getLeafAssetId(merkle, new BN(0)),
          content: {
            metadata: {
              name: metadata.name,
              symbol: metadata.symbol,
            },
            json_uri: metadata.uri,
          },
          royalty: {
            basis_points: metadata.sellerFeeBasisPoints,
            primary_sale_happened: true,
          },
          mutable: true,
          supply: {
            edition_nonce: null,
          },
          grouping: metadata.collection.key,
          uses: metadata.uses,
          creators: metadata.creators,
          ownership: { owner: hotspotOwner.publicKey },
          compression: {
            compressed: true,
            eligible: true,
          },
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
      await hemProgram.methods
        .issueEntityV0({
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .accounts({
          maker,
          dao,
          recipient: hotspotOwner.publicKey,
          issuingAuthority: makerKeypair.publicKey,
        })
        .signers([makerKeypair])
        .rpc({ skipPreflight: true });

      const method = (
        await onboardIotHotspot({
          program: hemProgram,
          assetId: hotspot,
          maker,
          dao,
          rewardableEntityConfig,
          getAssetFn,
          getAssetProofFn,
        })
      ).signers([makerKeypair, hotspotOwner]);

      await method.rpc({ skipPreflight: true });
      const { iotInfo } = await method.pubkeys();

      const iotInfoAccount = await hemProgram.account.iotHotspotInfoV0.fetch(
        iotInfo!
      );
      expect(Boolean(iotInfoAccount)).to.be.true;
    });

    it("updates entity config", async () => {
      const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
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
      beforeEach(async () => {
        await hemProgram.methods
          .issueEntityV0({
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .accounts({
            maker,
            dao,
            recipient: hotspotOwner.publicKey,
            issuingAuthority: makerKeypair.publicKey,
          })
          .signers([makerKeypair])
          .rpc({ skipPreflight: true });

        const method = (
          await onboardIotHotspot({
            program: hemProgram,
            assetId: hotspot,
            maker,
            dao,
            rewardableEntityConfig,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([makerKeypair, hotspotOwner]);

        await method.rpc({ skipPreflight: true });

        await dcProgram.methods
          .mintDataCreditsV0({
            hntAmount: toBN(startDcBal, 8),
          })
          .accounts({ dcMint, recipient: hotspotOwner.publicKey })
          .rpc();
      });

      it("changes the metadata", async () => {
        const location = new BN(1000);
        const elevation = 100;
        const gain = 100;

        const method = (
          await updateIotMetadata({
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

        const info = (await method.pubkeys()).iotInfo!;
        await method.rpc({ skipPreflight: true });

        const storageAcc = await hemProgram.account.iotHotspotInfoV0.fetch(
          info!
        );
        expect(storageAcc.location?.toNumber()).to.eq(location.toNumber());
        expect(storageAcc.elevation).to.eq(elevation);
        expect(storageAcc.gain).to.eq(gain);
      });

      it("updates maker", async () => {
        await hemProgram.methods
          .updateMakerV0({
            updateAuthority: PublicKey.default,
            issuingAuthority: PublicKey.default,
          })
          .accounts({
            maker,
            updateAuthority: makerKeypair.publicKey,
          })
          .signers([makerKeypair])
          .rpc();

        const acc = await hemProgram.account.makerV0.fetch(maker);
        expect(acc.issuingAuthority.toBase58()).to.eq(
          PublicKey.default.toBase58()
        );
        expect(acc.updateAuthority.toBase58()).to.eq(
          PublicKey.default.toBase58()
        );
      });

      it("doesn't assert gain outside range", async () => {
        const method = (
          await updateIotMetadata({
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
          await updateIotMetadata({
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
