import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { init as initDataCredits, mintDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { notEmittedKey, init as initBurn } from "@helium/no-emit-sdk";
import {
  Asset,
  AssetProof,
  createAtaAndMint,
  createMint,
  createMintInstructions,
  proofArgsAndAccounts,
  sendInstructions,
  toBN,
} from "@helium/spl-utils";
import { AddGatewayV1 } from "@helium/transactions";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import chai from "chai";
import {
  dataOnlyConfigKey,
  init as initHeliumEntityManager,
  iotInfoKey,
  onboardIotHotspot,
  onboardMobileHotspot,
  updateIotMetadata,
  updateMobileMetadata,
} from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { NoEmit } from "../target/types/no_emit";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  DC_FEE,
  ensureDCIdl,
  ensureHSDIdl,
  ensureHEMIdl,
  initTestDataCredits,
  initTestMaker,
  initTestRewardableEntityConfig,
  MAKER_STAKING_FEE,
} from "./utils/fixtures";
// @ts-ignore
import bs58 from "bs58";
const { expect } = chai;
// @ts-ignore
import { helium } from "@helium/proto";
// @ts-ignore
import axios from "axios";

import {
  MerkleTree,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import { BN } from "bn.js";
import chaiAsPromised from "chai-as-promised";
import { createMockCompression } from "./utils/compression";
import { loadKeypair } from "./utils/solana";
import {
  keyToAssetKey,
  mobileInfoKey,
} from "@helium/helium-entity-manager-sdk";

chai.use(chaiAsPromised);

describe("helium-entity-manager", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;
  let noEmitProgram: Program<NoEmit>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const eccVerifier = loadKeypair(__dirname + "/keypairs/verifier-test.json");
  let dao: PublicKey;
  let subDao: PublicKey;
  let dcMint: PublicKey;
  let activeDeviceAuthority: Keypair;

  before(async () => {
    await ensureDCIdl();
    await ensureHSDIdl();
    await ensureHEMIdl();
  });

  beforeEach(async () => {
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    noEmitProgram = await initBurn(
      provider,
      anchor.workspace.NoEmit.programId,
      anchor.workspace.NoEmit.idl
    );

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

    const dataCredits = await initTestDataCredits(dcProgram, provider);
    const hntMint = dataCredits.hntMint;
    dcMint = dataCredits.dcMint;
    ({ dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint,
      hntMint
    ));
    activeDeviceAuthority = Keypair.generate();
    ({ subDao } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
      activeDeviceAuthority: activeDeviceAuthority.publicKey,
      // Add some padding for onboards
      numTokens: MAKER_STAKING_FEE.mul(new BN(2)).add(new BN(100000000000)),
    }));
  });

  it("issues iot operations fund", async () => {
    const mint = Keypair.generate();
    await hemProgram.methods
      .issueIotOperationsFundV0()
      .preInstructions(await createMintInstructions(provider, 0, me, me, mint))
      .accountsPartial({
        dao,
        recipient: me,
        mint: mint.publicKey,
      })
      .signers([mint])
      .rpc({ skipPreflight: true });

    const addr = getAssociatedTokenAddressSync(mint.publicKey, me);
    const balance = await provider.connection.getTokenAccountBalance(addr);
    expect(balance.value.uiAmount).to.eq(1);
  });

  it("issues burn entity, and allows burn", async () => {
    const mint = Keypair.generate();
    await hemProgram.methods
      .issueNotEmittedEntityV0()
      .preInstructions(await createMintInstructions(provider, 0, me, me, mint))
      .accountsPartial({
        dao,
        mint: mint.publicKey,
      })
      .signers([mint])
      .rpc({ skipPreflight: true });

    const addr = getAssociatedTokenAddressSync(
      mint.publicKey,
      notEmittedKey()[0],
      true
    );
    const balance = await provider.connection.getTokenAccountBalance(addr);
    expect(balance.value.uiAmount).to.eq(1);

    const tokenMint = await createMint(provider, 2, me, me);
    const burnAta = await createAtaAndMint(
      provider,
      tokenMint,
      new BN(1000),
      notEmittedKey()[0]
    );
    await noEmitProgram.methods
      .noEmitV0()
      .accountsPartial({
        mint: tokenMint,
      })
      .rpc({ skipPreflight: true });

    const postBalance = (await getAccount(provider.connection, burnAta)).amount;
    expect(postBalance).to.eq(BigInt(0));
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

  it("initializes a data only config", async () => {
    const [height, buffer, canopy] = [14, 64, 11];
    const merkle = Keypair.generate();
    const space = getConcurrentMerkleTreeAccountSize(height, buffer, canopy);
    const cost = await provider.connection.getMinimumBalanceForRentExemption(
      space
    );
    await sendInstructions(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: merkle.publicKey,
          lamports: cost,
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
      ],
      [merkle]
    );
    await hemProgram.methods
      .initializeDataOnlyV0({
        authority: me,
        newTreeDepth: height,
        newTreeBufferSize: buffer,
        newTreeSpace: new BN(
          getConcurrentMerkleTreeAccountSize(height, buffer, canopy)
        ),
        newTreeFeeLamports: new BN((LAMPORTS_PER_SOL * 30) / 2 ** height),
        name: "DATAONLY",
        metadataUrl: "test",
      })
      .accountsPartial({
        dao,
        merkleTree: merkle.publicKey,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
      ])
      .rpc();
  });

  describe("with data only config", () => {
    let ecc: string;
    let rewardableEntityConfig: PublicKey;
    let getAssetFn: (
      url: string,
      assetId: PublicKey
    ) => Promise<Asset | undefined>;
    let getAssetProofFn: (
      url: string,
      assetId: PublicKey
    ) => Promise<AssetProof | undefined>;
    let hotspotOwner = Keypair.generate();
    let hotspot: PublicKey;
    let startDcBal = DC_FEE * 10;

    beforeEach(async () => {
      ({ rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        subDao
      ));
      ecc = (await HeliumKeypair.makeRandom()).address.b58;
      const [height, buffer, canopy] = [3, 8, 0];
      const merkle = Keypair.generate();
      const space = getConcurrentMerkleTreeAccountSize(height, buffer, canopy);
      const cost = await provider.connection.getMinimumBalanceForRentExemption(
        space
      );
      await sendInstructions(
        provider,
        [
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: merkle.publicKey,
            lamports: cost,
            space: space,
            programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          }),
        ],
        [merkle]
      );
      await hemProgram.methods
        .initializeDataOnlyV0({
          authority: me,
          newTreeDepth: height,
          newTreeBufferSize: buffer,
          newTreeSpace: new BN(
            getConcurrentMerkleTreeAccountSize(height, buffer, canopy)
          ),
          newTreeFeeLamports: new BN((LAMPORTS_PER_SOL * 30) / 2 ** height),
          name: "DATAONLY",
          metadataUrl: "test",
        })
        .accountsPartial({
          dao,
          merkleTree: merkle.publicKey,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        ])
        .rpc({ skipPreflight: true });

      const doAcc = await hemProgram.account.dataOnlyConfigV0.fetch(
        dataOnlyConfigKey(dao)[0]
      );

      ({ getAssetFn, getAssetProofFn, hotspot } = await createMockCompression({
        collection: doAcc.collection,
        dao,
        merkle: merkle.publicKey,
        ecc,
        hotspotOwner: hotspotOwner.publicKey,
      }));

      await provider.sendAll(
        (await mintDataCredits({
          program: dcProgram,
          hntAmount: toBN(startDcBal, 8),
          dcMint,
        })).txs
      );
    });
    it("issues and onboards an iot data only hotspot", async () => {
      let hotspotOwner = Keypair.generate();
      const issueMethod = hemProgram.methods
        .issueDataOnlyEntityV0({
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          recipient: hotspotOwner.publicKey,
          dao,
          eccVerifier: eccVerifier.publicKey,
        })
        .signers([eccVerifier]);

      const { keyToAsset } = await issueMethod.pubkeys();
      await issueMethod.rpc({ skipPreflight: true });

      console.log(keyToAsset?.toString());
      const ktaAcc = await hemProgram.account.keyToAssetV0.fetch(keyToAsset!);
      expect(Boolean(ktaAcc)).to.be.true;
      expect(ktaAcc.asset.toString()).to.eq(hotspot.toString());
      expect(ktaAcc.dao.toString()).to.eq(dao.toString());

      const { args } = await proofArgsAndAccounts({
        connection: hemProgram.provider.connection,
        assetId: hotspot,
        getAssetFn,
        getAssetProofFn,
      });
      const onboardMethod = hemProgram.methods
        .onboardDataOnlyIotHotspotV0({
          ...args,
          location: null,
          elevation: 50,
          gain: 100,
        })
        .accountsPartial({
          rewardableEntityConfig,
          hotspotOwner: hotspotOwner.publicKey,
          keyToAsset,
          iotInfo: iotInfoKey(rewardableEntityConfig, ecc)[0],
          subDao,
        })
        .signers([hotspotOwner]);

      const { iotInfo } = await onboardMethod.pubkeys();
      await onboardMethod.rpc();

      await hemProgram.methods
        .setEntityActiveV0({
          isActive: true,
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .accountsPartial({
          activeDeviceAuthority: activeDeviceAuthority.publicKey,
          rewardableEntityConfig,
          info: iotInfo!,
        })
        .signers([activeDeviceAuthority])
        .rpc({ skipPreflight: true });

      const iotInfoAccount = await hemProgram.account.iotHotspotInfoV0.fetch(
        iotInfo!
      );
      expect(Boolean(iotInfoAccount)).to.be.true;
      expect(iotInfoAccount.asset.toString()).to.eq(hotspot.toString());
      expect(iotInfoAccount.location).to.be.null;
      expect(iotInfoAccount.elevation).to.eq(50);
      expect(iotInfoAccount.gain).to.eq(100);
      expect(iotInfoAccount.isFullHotspot).to.be.false;

      const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
      expect(subDaoAcc.dcOnboardingFeesPaid.toNumber()).to.be.eq(
        subDaoAcc.onboardingDataOnlyDcFee.toNumber()
      );
    });

    it("issues and onboards a mobile data only hotspot", async () => {
      let hotspotOwner = Keypair.generate();
      const issueMethod = hemProgram.methods
        .issueDataOnlyEntityV0({
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          recipient: hotspotOwner.publicKey,
          dao,
          eccVerifier: eccVerifier.publicKey,
        })
        .signers([eccVerifier]);

      const { keyToAsset } = await issueMethod.pubkeys();
      await issueMethod.rpc({ skipPreflight: true });

      const ktaAcc = await hemProgram.account.keyToAssetV0.fetch(keyToAsset!);
      expect(Boolean(ktaAcc)).to.be.true;
      expect(ktaAcc.asset.toString()).to.eq(hotspot.toString());
      expect(ktaAcc.dao.toString()).to.eq(dao.toString());

      ({ rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        subDao,
        {
          mobileConfigV2: {
            feesByDevice: [
              {
                deviceType: { cbrs: {} },
                dcOnboardingFee: toBN(0, 5),
                locationStakingFee: toBN(10, 5),
                mobileOnboardingFeeUsd: toBN(0, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
              {
                deviceType: { wifiIndoor: {} },
                dcOnboardingFee: toBN(10, 5),
                locationStakingFee: toBN(0, 5),
                mobileOnboardingFeeUsd: toBN(10, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
              {
                deviceType: { wifiOutdoor: {} },
                dcOnboardingFee: toBN(10, 5),
                locationStakingFee: toBN(0, 5),
                mobileOnboardingFeeUsd: toBN(20, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
              {
                deviceType: { wifiDataOnly: {} },
                dcOnboardingFee: toBN(1, 5),
                locationStakingFee: toBN(0, 5),
                mobileOnboardingFeeUsd: toBN(1, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
            ],
          },
        }
      ));

      const { args } = await proofArgsAndAccounts({
        connection: hemProgram.provider.connection,
        assetId: hotspot,
        getAssetFn,
        getAssetProofFn,
      });
      const onboardMethod = hemProgram.methods
        .onboardDataOnlyMobileHotspotV0({
          ...args,
          location: null,
        })
        .accountsPartial({
          rewardableEntityConfig,
          hotspotOwner: hotspotOwner.publicKey,
          keyToAsset,
          mobileInfo: mobileInfoKey(rewardableEntityConfig, ecc)[0],
          subDao,
        })
        .signers([hotspotOwner]);

      const { mobileInfo } = await onboardMethod.pubkeys();
      await onboardMethod.rpc();

      await hemProgram.methods
        .setEntityActiveV0({
          isActive: true,
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .accountsPartial({
          activeDeviceAuthority: activeDeviceAuthority.publicKey,
          rewardableEntityConfig,
          info: mobileInfo!,
        })
        .signers([activeDeviceAuthority])
        .rpc({ skipPreflight: true });

      const mobileInfoAccount =
        await hemProgram.account.mobileHotspotInfoV0.fetch(mobileInfo!);
      expect(Boolean(mobileInfoAccount)).to.be.true;
      expect(mobileInfoAccount.asset.toString()).to.eq(hotspot.toString());
      expect(mobileInfoAccount.location).to.be.null;
      expect(mobileInfoAccount.isFullHotspot).to.be.false;
      expect(Object.keys(mobileInfoAccount.deviceType)[0]).to.eq(
        "wifiDataOnly"
      );

      const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
      expect(subDaoAcc.dcOnboardingFeesPaid.toNumber()).to.be.eq(100000);
    });

    it("can swap tree when it's full", async () => {
      let hotspotOwner = Keypair.generate();

      // fill up the tree
      while (true) {
        try {
          ecc = (await HeliumKeypair.makeRandom()).address.b58;
          await hemProgram.methods
            .issueDataOnlyEntityV0({
              entityKey: Buffer.from(bs58.decode(ecc)),
            })
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
            ])
            .accountsPartial({
              recipient: hotspotOwner.publicKey,
              dao,
              eccVerifier: eccVerifier.publicKey,
            })
            .signers([eccVerifier])
            .rpc({ skipPreflight: true });
        } catch (err) {
          break;
        }
      }
      const [height, buffer, canopy] = [3, 8, 0];
      const newMerkle = Keypair.generate();
      const space = getConcurrentMerkleTreeAccountSize(height, buffer, canopy);
      const cost = await provider.connection.getMinimumBalanceForRentExemption(
        space
      );
      await sendInstructions(
        provider,
        [
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: newMerkle.publicKey,
            lamports: cost,
            space: space,
            programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          }),
        ],
        [newMerkle]
      );
      await hemProgram.methods
        .updateDataOnlyTreeV0()
        .accountsPartial({
          dataOnlyConfig: dataOnlyConfigKey(dao)[0],
          newMerkleTree: newMerkle.publicKey,
        })
        .rpc({ skipPreflight: true });
    });
  });

  it("initializes a maker", async () => {
    const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
      hemProgram,
      subDao
    );

    const { maker, collection, makerKeypair } = await initTestMaker(
      hemProgram,
      provider,
      rewardableEntityConfig,
      dao
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

  it("allows revoking a maker", async () => {
    const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
      hemProgram,
      subDao
    );

    const { maker } = await initTestMaker(
      hemProgram,
      provider,
      rewardableEntityConfig,
      dao
    );

    const {
      pubkeys: { makerApproval },
    } = await hemProgram.methods
      .revokeMakerV0()
      .accountsPartial({
        maker,
        rewardableEntityConfig,
      })
      .rpcAndKeys();

    const account = await hemProgram.account.makerApprovalV0.fetchNullable(
      makerApproval!
    );
    expect(account).to.be.null;
  });

  it("allows approving and revoking programs", async () => {
    const keypair = Keypair.generate();
    const {
      pubkeys: { programApproval },
    } = await hemProgram.methods
      .approveProgramV0({
        programId: keypair.publicKey,
      })
      .accountsPartial({
        dao,
      })
      .rpcAndKeys();

    const account = await hemProgram.account.programApprovalV0.fetch(
      programApproval!
    );
    expect(account.programId.toBase58()).eq(keypair.publicKey.toBase58());
    await hemProgram.methods
      .revokeProgramV0({
        programId: keypair.publicKey,
      })
      .accountsPartial({
        dao,
      })
      .rpc();

    const account2 = await hemProgram.account.programApprovalV0.fetchNullable(
      programApproval!
    );
    expect(account2).to.be.null;
  });

  describe("with mobile maker and data credits", () => {
    let makerKeypair: Keypair;
    let maker: PublicKey;
    let startDcBal = DC_FEE * 10;

    let getAssetFn: (
      url: string,
      assetId: PublicKey
    ) => Promise<Asset | undefined>;
    let getAssetProofFn: (
      url: string,
      assetId: PublicKey
    ) => Promise<AssetProof | undefined>;
    let rewardableEntityConfig: PublicKey;
    let ecc: string;
    let hotspot: PublicKey;
    let hotspotOwner = Keypair.generate();
    beforeEach(async () => {
      ecc = (await HeliumKeypair.makeRandom()).address.b58;

      ({ rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        subDao,
        {
          mobileConfigV2: {
            feesByDevice: [
              {
                deviceType: { cbrs: {} },
                dcOnboardingFee: toBN(0, 5),
                locationStakingFee: toBN(10, 5),
                mobileOnboardingFeeUsd: toBN(0, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
              {
                deviceType: { wifiIndoor: {} },
                dcOnboardingFee: toBN(10, 5),
                locationStakingFee: toBN(0, 5),
                mobileOnboardingFeeUsd: toBN(10, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
              {
                deviceType: { wifiOutdoor: {} },
                dcOnboardingFee: toBN(10, 5),
                locationStakingFee: toBN(0, 5),
                mobileOnboardingFeeUsd: toBN(20, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
              {
                deviceType: { wifiDataOnly: {} },
                dcOnboardingFee: toBN(1, 5),
                locationStakingFee: toBN(0, 5),
                mobileOnboardingFeeUsd: toBN(1, 6),
                reserved: new Array(8).fill(new BN(0)),
              },
            ],
          },
        }
      ));

      const makerConf = await initTestMaker(
        hemProgram,
        provider,
        rewardableEntityConfig,
        dao
      );

      await initTestMaker(hemProgram, provider, rewardableEntityConfig, dao);

      await provider.sendAll(
        (await mintDataCredits({
          program: dcProgram,
          hntAmount: toBN(startDcBal, 8),
          dcMint,
        })).txs
      );

      maker = makerConf.maker;
      makerKeypair = makerConf.makerKeypair;

      ({ getAssetFn, getAssetProofFn, hotspot } = await createMockCompression({
        collection: makerConf.collection,
        dao,
        merkle: makerConf.merkle,
        ecc,
        hotspotOwner: hotspotOwner.publicKey,
      }));
    });

    // Only uncomment this when you want to debug the sig verifier service locally.
    // You can run it like:
    // env ANCHOR_WALLET=path/to//helium-program-library/tests/verifier-test.json cargo run
    xit("properly uses the sig verifier service", async () => {
      const issueTx =
        "CroBCiEB7UTmtDnUwT3fGbvn4ASvsi5n6wJiNTs/euxRYXFWiRASIQCIruPASTMtSA87u0hkkApMXY/q2cydP5We1vkyUj9fiSJGMEQCIA46K0Xug+nxpaLi9z25jEI5RtHmWTtvgZFOQBr06jzKAiBifpM+/m/k3SwDAES9FA9QqPv4ElDhh+zCqMbJ15DqYiohAfK7mMA4Bu0mM6e/N81WeNbTEFdgyo4A5g5MgsPQjMazOICS9AFA6PsD";
      const txn = AddGatewayV1.fromString(issueTx);
      const eccKey = txn.gateway?.b58;
      // @ts-ignore
      const addGateway = txn.toProto(true);
      const serialized = helium.blockchain_txn_add_gateway_v1
        .encode(addGateway)
        .finish();

      let tx = await hemProgram.methods
        .issueEntityV0({
          entityKey: Buffer.from(bs58.decode(eccKey!)),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        ])
        .accountsPartial({
          maker,
          recipient: hotspotOwner.publicKey,
          issuingAuthority: makerKeypair.publicKey,
          dao,
          eccVerifier: eccVerifier.publicKey,
        })
        .signers([makerKeypair])
        .transaction();
      tx.recentBlockhash = (
        await provider.connection.getRecentBlockhash()
      ).blockhash;
      tx.feePayer = provider.wallet.publicKey;
      tx.partialSign(makerKeypair);
      tx = await provider.wallet.signTransaction(tx);

      const { transaction } = (
        await axios.post("http://localhost:8000/verify", {
          transaction: tx
            .serialize({
              requireAllSignatures: false,
            })
            .toString("hex"),
          msg: Buffer.from(serialized).toString("hex"),
          signature: Buffer.from(txn.gatewaySignature!).toString("hex"),
        })
      ).data;
      const sig = await provider.connection.sendRawTransaction(
        Buffer.from(transaction, "hex")
      );
      await provider.connection.confirmTransaction(sig);
    });

    it("issues a mobile hotspot", async () => {
      await hemProgram.methods
        .issueEntityV0({
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          maker,
          recipient: hotspotOwner.publicKey,
          issuingAuthority: makerKeypair.publicKey,
          dao,
          eccVerifier: eccVerifier.publicKey,
        })
        .signers([makerKeypair, eccVerifier])
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
          deviceType: "wifiIndoor",
          deploymentInfo: null,
        })
      ).signers([makerKeypair, hotspotOwner]);

      await method.rpc({ skipPreflight: true });
      const { mobileInfo } = await method.pubkeys();

      await hemProgram.methods
        .setEntityActiveV0({
          isActive: true,
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .accountsPartial({
          activeDeviceAuthority: activeDeviceAuthority.publicKey,
          rewardableEntityConfig,
          info: mobileInfo! as PublicKey,
        })
        .signers([activeDeviceAuthority])
        .rpc({ skipPreflight: true });

      const mobileInfoAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
        mobileInfo!
      );
      expect(Boolean(mobileInfoAcc)).to.be.true;
      const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
      expect(subDaoAcc.dcOnboardingFeesPaid.toNumber()).to.be.eq(1000000);
    });

    describe("with hotspot", () => {
      let infoKey: PublicKey | undefined;
      beforeEach(async () => {
        await hemProgram.methods
          .issueEntityV0({
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
          ])
          .accountsPartial({
            maker,
            dao,
            recipient: hotspotOwner.publicKey,
            issuingAuthority: makerKeypair.publicKey,
            eccVerifier: eccVerifier.publicKey,
          })
          .signers([makerKeypair, eccVerifier])
          .rpc({ skipPreflight: true });

        await hsdProgram.methods
          .updateSubDaoV0({
            authority: null,
            dcBurnAuthority: null,
            emissionSchedule: null,
            onboardingDcFee: new BN(0),
            onboardingDataOnlyDcFee: null,
            registrar: null,
            activeDeviceAuthority: null,
          })
          .accountsPartial({
            subDao,
          })
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
            location: new BN(100),
            deploymentInfo: null,
          })
        ).signers([makerKeypair, hotspotOwner]);

        ({ mobileInfo: infoKey } = await method.pubkeys());

        await method.rpc({ skipPreflight: true });
        await provider.sendAll(
          (await mintDataCredits({
            program: dcProgram,
            hntAmount: toBN(startDcBal, 8),
            dcMint,
            recipient: hotspotOwner.publicKey,
          })).txs
        );
      });

      it("onboarding fees be backpaid with DC when subdao fees are raised", async () => {
        const method = hemProgram.methods
          .tempPayMobileOnboardingFeeV0()
          .accountsPartial({
            rewardableEntityConfig,
            subDao,
            dao,
            keyToAsset: keyToAssetKey(dao, ecc)[0],
            mobileInfo: infoKey!,
          });
        const ata = getAssociatedTokenAddressSync(
          dcMint,
          provider.wallet.publicKey
        );
        const preBalance = await provider.connection.getTokenAccountBalance(
          ata
        );
        const preInfoAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
          infoKey!
        );
        expect(preInfoAcc.dcOnboardingFeePaid.toNumber()).to.eq(0);

        await hemProgram.methods
          .updateRewardableEntityConfigV0({
            settings: {
              mobileConfigV2: {
                feesByDevice: [
                  {
                    deviceType: { cbrs: {} },
                    dcOnboardingFee: toBN(40, 5),
                    locationStakingFee: toBN(10, 5),
                    mobileOnboardingFeeUsd: toBN(0, 6),
                    reserved: new Array(8).fill(new BN(0)),
                  },
                  {
                    deviceType: { wifiIndoor: {} },
                    dcOnboardingFee: toBN(10, 5),
                    locationStakingFee: toBN(0, 5),
                    mobileOnboardingFeeUsd: toBN(10, 6),
                    reserved: new Array(8).fill(new BN(0)),
                  },
                  {
                    deviceType: { wifiOutdoor: {} },
                    dcOnboardingFee: toBN(10, 5),
                    locationStakingFee: toBN(0, 5),
                    mobileOnboardingFeeUsd: toBN(20, 6),
                    reserved: new Array(8).fill(new BN(0)),
                  },
                  {
                    deviceType: { wifiDataOnly: {} },
                    dcOnboardingFee: toBN(1, 5),
                    locationStakingFee: toBN(0, 5),
                    mobileOnboardingFeeUsd: toBN(1, 6),
                    reserved: new Array(8).fill(new BN(0)),
                  },
                ],
              },
            },
            newAuthority: null,
            stakingRequirement: MAKER_STAKING_FEE,
          })
          .accountsPartial({ rewardableEntityConfig })
          .rpc({ skipPreflight: true });

        await method.rpc({ skipPreflight: true });

        const postBalance = await provider.connection.getTokenAccountBalance(
          ata
        );
        expect(postBalance.value.uiAmount).to.be.eq(
          preBalance.value.uiAmount! - toBN(40, 5).toNumber()
        );
        const infoAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
          infoKey!
        );
        expect(infoAcc.dcOnboardingFeePaid.toNumber()).to.eq(
          toBN(40, 5).toNumber()
        );
      });

      it("changes the metadata", async () => {
        const location = new BN(1000);
        const wifiInfo = {
          antenna: 1,
          elevation: 2,
          azimuth: 3,
          mechanicalDownTilt: 4,
          electricalDownTilt: 5,
          serial: "1234567890",
        };

        const method = (
          await updateMobileMetadata({
            program: hemProgram,
            assetId: hotspot,
            rewardableEntityConfig,
            location,
            getAssetFn,
            getAssetProofFn,
            deploymentInfo: {
              wifiInfoV0: wifiInfo,
            },
          })
        ).signers([hotspotOwner]);

        const info = (await method.pubkeys()).mobileInfo!;
        await method.rpc({ skipPreflight: true });

        const storageAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
          info!
        );
        expect(storageAcc.location?.toNumber()).to.eq(location.toNumber());
        expect(storageAcc.deploymentInfo?.wifiInfoV0).to.deep.equal(wifiInfo);
      });

      it("oracle can update active status", async () => {
        await hemProgram.methods
          .setEntityActiveV0({
            isActive: false,
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .accountsPartial({
            activeDeviceAuthority: activeDeviceAuthority.publicKey,
            rewardableEntityConfig,
            info: infoKey!,
          })
          .signers([activeDeviceAuthority])
          .rpc({ skipPreflight: true });

        const infoAcc = await hemProgram.account.mobileHotspotInfoV0.fetch(
          infoKey!
        );
        expect(infoAcc.isActive).to.be.false;
        const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
        expect(subDaoAcc.dcOnboardingFeesPaid.toNumber()).to.be.eq(0);
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
        rewardableEntityConfig,
        dao
      );

      await initTestMaker(hemProgram, provider, rewardableEntityConfig, dao);

      await provider.sendAll(
        (await mintDataCredits({
          program: dcProgram,
          hntAmount: toBN(startDcBal, 8),
          dcMint,
        })).txs
      );

      maker = makerConf.maker;
      makerKeypair = makerConf.makerKeypair;
      hotspotCollection = makerConf.collection;

      ({ getAssetFn, getAssetProofFn, hotspot } = await createMockCompression({
        collection: makerConf.collection,
        dao,
        merkle: makerConf.merkle,
        ecc,
        hotspotOwner: hotspotOwner.publicKey,
      }));
    });

    it("issues an iot hotspot", async () => {
      await hemProgram.methods
        .issueEntityV0({
          entityKey: Buffer.from(bs58.decode(ecc)),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        ])
        .accountsPartial({
          maker,
          dao,
          recipient: hotspotOwner.publicKey,
          issuingAuthority: makerKeypair.publicKey,
          eccVerifier: eccVerifier.publicKey,
        })
        .signers([makerKeypair, eccVerifier])
        .rpc({ skipPreflight: true });

      const method = (
        await onboardIotHotspot({
          program: hemProgram,
          assetId: hotspot,
          maker,
          dao,
          rewardableEntityConfig,
          location: new BN(1000),
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
      const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
      expect(subDaoAcc.dcOnboardingFeesPaid.toNumber()).to.be.eq(0);
    });

    it("updates entity config", async () => {
      const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
        hemProgram,
        subDao
      );

      await hemProgram.methods
        .updateRewardableEntityConfigV0({
          newAuthority: PublicKey.default,
          settings: null,
          stakingRequirement: null,
        })
        .accountsPartial({
          rewardableEntityConfig,
        })
        .rpc();

      const acc = await hemProgram.account.rewardableEntityConfigV0.fetch(
        rewardableEntityConfig
      );
      expect(acc.authority.toBase58()).to.equal(PublicKey.default.toBase58());
    });

    describe("with hotspot", () => {
      let infoKey: PublicKey | undefined;
      beforeEach(async () => {
        await hemProgram.methods
          .issueEntityV0({
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
          ])
          .accountsPartial({
            maker,
            dao,
            recipient: hotspotOwner.publicKey,
            issuingAuthority: makerKeypair.publicKey,
            eccVerifier: eccVerifier.publicKey,
          })
          .signers([makerKeypair, eccVerifier])
          .rpc({ skipPreflight: true });

        const method = (
          await onboardIotHotspot({
            program: hemProgram,
            assetId: hotspot,
            maker,
            dao,
            location: new BN(100),
            rewardableEntityConfig,
            getAssetFn,
            getAssetProofFn,
          })
        ).signers([makerKeypair, hotspotOwner]);
        ({ iotInfo: infoKey } = await method.pubkeys());

        await method.rpc({ skipPreflight: true });

        await provider.sendAll(
          (await mintDataCredits({
            program: dcProgram,
            hntAmount: toBN(startDcBal, 8),
            dcMint,
            recipient: hotspotOwner.publicKey,
          })).txs
        );
      });

      it("oracle can update active status", async () => {
        await hemProgram.methods
          .setEntityActiveV0({
            isActive: false,
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .accountsPartial({
            activeDeviceAuthority: activeDeviceAuthority.publicKey,
            rewardableEntityConfig,
            info: infoKey!,
          })
          .signers([activeDeviceAuthority])
          .rpc({ skipPreflight: true });

        console.log(infoKey);
        const infoAcc = await hemProgram.account.iotHotspotInfoV0.fetch(
          infoKey!
        );
        expect(infoAcc.isActive).to.be.false;
        const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);
        expect(subDaoAcc.dcOnboardingFeesPaid.toNumber()).to.be.eq(0);
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
          .accountsPartial({
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
