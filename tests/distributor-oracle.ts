import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import Address from "@helium/address";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import {
  PROGRAM_ID as DC_PID,
  init as initDataCredits,
} from "@helium/data-credits-sdk";
import {
  daoKey,
  PROGRAM_ID as HSD_PID,
  init as initHeliumSubDaos,
} from "@helium/helium-sub-daos-sdk";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import {
  Asset,
  AssetProof,
  createAtaAndMint,
  createMint,
  getAsset,
  sendAndConfirmWithRetry,
  sendInstructions,
} from "@helium/spl-utils";
import {
  init as initTuktuk
} from "@helium/tuktuk-sdk";
import {
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import chai, { assert, expect } from "chai";
import chaiHttp from "chai-http";
import fs from "fs";
import * as client from "../packages/distributor-oracle/src/client";
import {
  Database,
  OracleServer,
  RewardableEntity,
} from "../packages/distributor-oracle/src/server";
import {
  decodeEntityKey,
  PROGRAM_ID as HEM_PID,
  init as initHeliumEntityManager,
  keyToAssetForAsset,
  keyToAssetKey,
} from "../packages/helium-entity-manager-sdk/src";
import {
  initializeCompressionRecipient,
  init as initLazy,
  PROGRAM_ID as LD_PID,
} from "../packages/lazy-distributor-sdk/src";
import {
  init as initRewards,
  oracleSignerKey,
  PROGRAM_ID as REWARDS_PID,
} from "../packages/rewards-oracle-sdk/src";
import {
  PROGRAM_ID as VSR_PID,
  init as vsrInit,
} from "../packages/voter-stake-registry-sdk/src";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { RewardsOracle } from "../target/types/rewards_oracle";
import { createMockCompression } from "./utils/compression";
import {
  ensureHEMIdl,
  ensureHSDIdl,
  ensureLDIdl,
  initWorld,
} from "./utils/fixtures";
import { initVsr } from "./utils/vsr";

chai.use(chaiHttp);

export class DatabaseMock implements Database {
  dao: PublicKey;
  readonly hemProgram: Program<HeliumEntityManager>;
  readonly getAssetFn: (
    url: string,
    asset: PublicKey
  ) => Promise<Asset | undefined>;
  inMemHash: {
    totalClicks: number;
    lifetimeRewards: number;
    byHotspot: {
      [key: string]: {
        totalClicks: number;
        lifetimeRewards: number;
      };
    };
  };

  constructor(
    hemProgram: Program<HeliumEntityManager>,
    getAssetFn: (
      url: string,
      asset: PublicKey
    ) => Promise<Asset | undefined> = getAsset,
    dao: PublicKey
  ) {
    this.hemProgram = hemProgram;
    this.getAssetFn = getAssetFn;
    this.dao = dao;
    this.inMemHash = {
      totalClicks: 0,
      lifetimeRewards: 0,
      byHotspot: {},
    };
  }
  async getRewardsByOwner(owner: string): Promise<{ lifetime: string; pending: string; }> {
    return { lifetime: "0", pending: "0" };
  }
  async getRewardsByDestination(destination: string): Promise<{ lifetime: string; pending: string; }> {
    return { lifetime: "0", pending: "0" };
  }

  getRewardableEntities(wallet: anchor.web3.PublicKey, limit: number, batchNumber?: number): Promise<{ entities: RewardableEntity[]; nextBatchNumber: number; }> {
    throw new Error("Method not implemented.");
  }

  async getTotalRewards() {
    return "0";
  }

  async getCurrentRewardsByEntity(entityKey: string): Promise<string> {
    const pubkey = Address.fromB58(entityKey);
    return Math.floor(
      (this.inMemHash.byHotspot[pubkey.b58]?.lifetimeRewards || 0) *
        Math.pow(10, 8)
    ).toString();
  }

  async getActiveDevices(): Promise<number> {
    return 0;
  }

  async getBulkRewards(entityKeys: string[]): Promise<Record<string, string>> {
    let _this = this;
    const res: Record<string, string> = entityKeys.reduce(
      (acc: Record<string, string>, key) => {
        const pubkey = Address.fromB58(key);
        acc[key] = Math.floor(
          (_this.inMemHash.byHotspot[pubkey.b58]?.lifetimeRewards || 0) *
            Math.pow(10, 8)
        ).toString();
        return acc;
      },
      {}
    );

    return res;
  }

  reset() {
    this.inMemHash = {
      totalClicks: 0,
      lifetimeRewards: 0,
      byHotspot: {},
    };
  }

  async getCurrentRewards(assetId: PublicKey) {
    const asset = await this.getAssetFn(
      // @ts-ignore
      this.hemProgram.provider.connection._rpcEndpoint,
      assetId
    );
    if (!asset) {
      console.error("No asset found", assetId.toBase58());
      return "0";
    }
    const kta = keyToAssetForAsset(asset, this.dao)
    const ktaAcc = await this.hemProgram.account.keyToAssetV0.fetch(kta)
    const eccCompact = decodeEntityKey(
      ktaAcc.entityKey,
      ktaAcc.keySerialization
    )!;
    try {
      return Math.floor(
        (this.inMemHash.byHotspot[eccCompact]?.lifetimeRewards || 0) *
          Math.pow(10, 8)
      ).toString();
    } catch (err) {
      console.error("Mint with error: ", asset.toString());
      console.error(err);
      return "0";
    }
  }

  async incrementHotspotRewards(hotspotKey: string) {
    this.inMemHash = {
      ...this.inMemHash,
      totalClicks: this.inMemHash.totalClicks + 1,
      byHotspot: {
        ...this.inMemHash.byHotspot,
        [hotspotKey]: {
          totalClicks:
            (this.inMemHash.byHotspot[hotspotKey]?.totalClicks || 0) + 1,
          lifetimeRewards:
            (this.inMemHash.byHotspot[hotspotKey]?.lifetimeRewards || 0) + 1,
        },
      },
    };
  }

  async endEpoch() {
    const rewardablePercentageByHotspot: { [key: string]: number } = {};
    const { totalClicks, byHotspot } = this.inMemHash;
    const clickRewardsDiff = totalClicks;
    const maxEpochRewards = +(process.env.EPOCH_MAX_REWARDS || 50);

    if (maxEpochRewards > 0) {
      for (const [key, value] of Object.entries(byHotspot)) {
        const diff = value.totalClicks;
        let awardedAmount =
          diff <= 0 ? 0 : (diff / clickRewardsDiff) * maxEpochRewards;

        rewardablePercentageByHotspot[key] = awardedAmount;

        this.inMemHash = {
          totalClicks: 0,
          lifetimeRewards: this.inMemHash.lifetimeRewards + awardedAmount,
          byHotspot: {
            ...this.inMemHash.byHotspot,
            [key]: {
              totalClicks: 0,
              lifetimeRewards:
                this.inMemHash.byHotspot[key].lifetimeRewards + awardedAmount,
            },
          },
        };
      }
    }

    return rewardablePercentageByHotspot;
  }
}

function loadKeypair(keypair: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}

describe("distributor-oracle", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));
  let tuktukProgram: any;
  let ldProgram: Program<LazyDistributor>;
  let rewardsProgram: Program<RewardsOracle>;
  let hemProgram: Program<HeliumEntityManager>;
  let oracleServer: OracleServer;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const oracle = Keypair.generate();
  let rewardsMint: PublicKey;
  let lazyDistributor: PublicKey;
  let recipient: PublicKey;
  let asset: PublicKey;
  let daoK: PublicKey;
  let ecc: string;
  let getAssetFn: () => Promise<Asset | undefined>;
  let getAssetProofFn: () => Promise<AssetProof | undefined>;

  before(async () => {
    await ensureLDIdl();
    await ensureHEMIdl();
    await ensureHSDIdl();
  });

  beforeEach(async () => {
    tuktukProgram = await initTuktuk(provider);
    ldProgram = await initLazy(
      provider,
      LD_PID,
      anchor.workspace.LazyDistributor.idl
    );
    rewardsProgram = await initRewards(
      provider,
      REWARDS_PID,
      anchor.workspace.RewardsOracle.idl
    );
    hemProgram = await initHeliumEntityManager(
      provider,
      HEM_PID,
      anchor.workspace.HeliumEntityManager.idl
    );

    rewardsMint = await createMint(provider, 6, me, me);

    const hntMint = await createMint(provider, 8, me, me);

    let method = await ldProgram.methods
      .initializeLazyDistributorV0({
        authority: me,
        oracles: [
          {
            oracle: oracle.publicKey,
            url: "https://some-url/",
          },
        ],
        windowConfig: {
          windowSizeSeconds: new anchor.BN(10),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN(1000000000),
        },
        approver: oracleSignerKey()[0],
      })
      .accountsPartial({
        rewardsMint,
      });
    await method.rpc({ skipPreflight: true });

    const pubkeys = await method.pubkeys();
    lazyDistributor = pubkeys.lazyDistributor!;
    await createAtaAndMint(
      provider,
      pubkeys.rewardsMint!,
      1000000000000,
      pubkeys.lazyDistributor
    );

    const hsdProgram = await initHeliumSubDaos(
      provider,
      HSD_PID,
      anchor.workspace.HeliumSubDaos.idl
    );
    const dcProgram = await initDataCredits(
      provider,
      DC_PID,
      anchor.workspace.DataCredits.idl
    );
    const vsrProgram = await vsrInit(
      provider,
      VSR_PID,
      anchor.workspace.VoterStakeRegistry.idl
    );
    const nftProxyProgram = await initNftProxy(provider);
    const { registrar } = await initVsr(
      vsrProgram,
      nftProxyProgram,
      provider,
      me,
      hntMint,
      daoKey(hntMint)[0],
      1,
      3
    );

    const {
      dao: { dao },
      dataCredits: { dcMint },
      maker: { maker, makerKeypair, merkle, collection },
      rewardableEntityConfig: { rewardableEntityConfig },
    } = await initWorld(
      provider,
      hemProgram,
      hsdProgram,
      dcProgram,
      1,
      1,
      registrar,
      hntMint
    );
    daoK = dao;
    const eccVerifier = loadKeypair(__dirname + "/keypairs/verifier-test.json");
    ecc = (await HeliumKeypair.makeRandom()).address.b58;

    const hotspotOwner = Keypair.generate();
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

    ({
      getAssetFn,
      getAssetProofFn,
      hotspot: asset,
    } = await createMockCompression({
      collection: collection,
      dao,
      merkle: merkle,
      ecc,
      hotspotOwner: hotspotOwner.publicKey,
    }));
    const recipientMethod = await initializeCompressionRecipient({
      program: ldProgram,
      assetId: asset,
      lazyDistributor,
      getAssetFn,
      getAssetProofFn,
    });

    await recipientMethod.rpc({ skipPreflight: true });
    recipient = (await recipientMethod.pubkeys()).recipient!;

    let db = new DatabaseMock(hemProgram, getAssetFn, dao);
    db.incrementHotspotRewards(ecc);
    oracleServer = new OracleServer(
      tuktukProgram,
      ldProgram,
      rewardsProgram,
      hemProgram,
      null,
      oracle,
      db,
      lazyDistributor,
      dao
    );
    await oracleServer.start();

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: oracle.publicKey,
        lamports: LAMPORTS_PER_SOL,
      }),
    ]);
  });

  afterEach(async function () {
    if (oracleServer) await oracleServer.close();
  });

  it("allows oracle to set current reward", async () => {
    const keyToAsset = keyToAssetKey(daoK, ecc)[0];
    await rewardsProgram.methods
      .setCurrentRewardsWrapperV1({
        currentRewards: new anchor.BN("5000000"),
        oracleIndex: 0,
      })
      .accountsPartial({
        lazyDistributor,
        recipient,
        keyToAsset,
        oracle: oracle.publicKey,
        lazyDistributorProgram: new PublicKey(
          "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w"
        ),
      })
      .signers([oracle])
      .rpc();

    const recipientAcc = await ldProgram.account.recipientV0.fetch(recipient);
    // @ts-ignore
    expect(recipientAcc?.currentRewards.length).to.eq(1);

    // @ts-ignore
    expect(recipientAcc?.currentRewards[0].toNumber()).to.eq(5000000);
  });

  it("should provide the current rewards for a hotspot", async () => {
    const res = await chai
      .request(oracleServer.server)
      .get("/?assetId=hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR");

    assert.equal(res.status, 200);
    assert.typeOf(res.body, "object");
    assert.equal(
      res.body.currentRewards,
      await oracleServer.db.getCurrentRewards(asset)
    );
  });

  it("should bulk sign transactions", async () => {
    const unsigned = await client.formBulkTransactions({
      program: ldProgram,
      rewardsOracleProgram: rewardsProgram,
      getAssetBatchFn: async () => [(await getAssetFn())!],
      getAssetProofBatchFn: async () => ({
        [asset.toBase58()]: (await getAssetProofFn())!,
      }),
      rewards: [
        {
          oracleKey: oracle.publicKey,
          currentRewards: await oracleServer.db.getBulkRewards([ecc]),
        },
      ],
      assets: [asset],
      compressionAssetAccs: [(await getAssetFn())!],
      lazyDistributor,
      skipOracleSign: true,
    });
    const tx = await provider.wallet.signTransaction(unsigned[0]);
    const serializedTx = tx.serialize();

    const res = await chai
      .request(oracleServer.server)
      .post("/bulk-sign")
      .send({ transactions: [[...serializedTx]] });

    console.log(res.body);
    assert.hasAllKeys(res.body, ["transactions", "success"]);
    const signedTx = VersionedTransaction.deserialize(res.body.transactions[0].data);
    await sendAndConfirmWithRetry(
      provider.connection,
      Buffer.from(signedTx.serialize()),
      {
        skipPreflight: true,
      },
      "confirmed"
    );

    const recipientAcc = await ldProgram.account.recipientV0.fetch(recipient);
    assert.equal(
      recipientAcc.totalRewards.toNumber(),
      Number(await oracleServer.db.getCurrentRewards(asset))
    );
  });

  it("should sign and execute properly formed transactions", async () => {
    const unsigned = await client.formTransaction({
      program: ldProgram,
      rewardsOracleProgram: rewardsProgram,
      provider,
      getAssetFn,
      getAssetProofFn,
      rewards: [
        {
          oracleKey: oracle.publicKey,
          currentRewards: await oracleServer.db.getCurrentRewards(asset),
        },
      ],
      asset: asset,
      lazyDistributor,
      skipOracleSign: true,
    });
    const tx = await provider.wallet.signTransaction(unsigned);
    const serializedTx = tx.serialize();

    const res = await chai
      .request(oracleServer.server)
      .post("/")
      .send({ transaction: Buffer.from(serializedTx) });

    assert.hasAllKeys(res.body, ["transaction", "success"]);
    const signedTx = VersionedTransaction.deserialize(res.body.transaction.data);
    await sendAndConfirmWithRetry(
      provider.connection,
      Buffer.from(signedTx.serialize()),
      {
        skipPreflight: true,
      },
      "confirmed"
    );

    const recipientAcc = await ldProgram.account.recipientV0.fetch(recipient);
    assert.equal(
      recipientAcc.totalRewards.toNumber(),
      Number(await oracleServer.db.getCurrentRewards(asset))
    );
  });

  it("should set rewards with the v1 endpoint", async () => {
    const keyToAsset = keyToAssetKey(daoK, ecc)[0];
    const res = await chai
      .request(oracleServer.server)
      .post("/v1/sign")
      .send({ keyToAssetKeys: [keyToAsset.toBase58()] });

    assert.hasAllKeys(res.body, ["messages", "oracle"]);
    const { messages, oracle } = res.body;
    await rewardsProgram.methods
      .setCurrentRewardsWrapperV2({
        currentRewards: new anchor.BN("100000000"),
        oracleIndex: 0,
      })
      .accountsPartial({
        lazyDistributor,
        recipient,
        keyToAsset,
        lazyDistributorProgram: new PublicKey(
          "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w"
        ),
      })
      .preInstructions([
        Ed25519Program.createInstructionWithPublicKey({
          publicKey: new PublicKey(oracle).toBytes(),
          message: Buffer.from(messages[0].serialized, "base64"),
          signature: Buffer.from(messages[0].signature, "base64"),
        }),
      ])
      .rpc({ skipPreflight: true });

    const recipientAcc = await ldProgram.account.recipientV0.fetch(recipient);
    assert.equal(
      recipientAcc.currentRewards[0]?.toNumber(),
      Number(await oracleServer.db.getCurrentRewards(asset))
    );
  });

  describe("Transaction validation tests", () => {
    it("doesn't sign if setRewards value is incorrect", async () => {
      const ix = await ldProgram.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(
            (await oracleServer.db.getCurrentRewards(asset)) + 1000
          ),
          oracleIndex: 0,
        })
        .accountsPartial({
          lazyDistributor,
          recipient,
          oracle: oracle.publicKey,
        })
        .instruction();
      let tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = provider.wallet.publicKey;

      const serializedTx = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const res = await chai
        .request(oracleServer.server)
        .post("/")
        .send({ transaction: serializedTx });

      assert.equal(Object.keys(res.body).length, 1);
      assert("error" in res.body);
    });

    it("doesn't sign if unauthorised instructions are included", async () => {
      const ix = await ldProgram.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(
            await oracleServer.db.getCurrentRewards(asset)
          ),
          oracleIndex: 0,
        })
        .accountsPartial({
          lazyDistributor,
          recipient,
          oracle: oracle.publicKey,
        })
        .instruction();
      let tx = new Transaction();
      tx.add(ix);
      tx.add(
        SystemProgram.transfer({
          fromPubkey: oracle.publicKey,
          toPubkey: me,
          lamports: 100000000,
        })
      );
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = provider.wallet.publicKey;

      const serializedTx = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const res = await chai
        .request(oracleServer.server)
        .post("/")
        .send({ transaction: serializedTx });

      assert.equal(Object.keys(res.body).length, 1);
      assert("error" in res.body);
    });

    it("doesn't sign if oracle is set as the fee payer", async () => {
      const ix = await ldProgram.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(
            await oracleServer.db.getCurrentRewards(asset)
          ),
          oracleIndex: 0,
        })
        .accountsPartial({
          lazyDistributor,
          recipient,
          oracle: oracle.publicKey,
        })
        .instruction();
      let tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = oracle.publicKey;

      const serializedTx = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const res = await chai
        .request(oracleServer.server)
        .post("/")
        .send({ transaction: serializedTx });

      assert.equal(Object.keys(res.body).length, 1);
      assert("error" in res.body);
    });
  });
});
