import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import Address from "@helium/address";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import {
  PROGRAM_ID as DC_PID,
  init as initDataCredits
} from "@helium/data-credits-sdk";
import {
  daoKey,
  PROGRAM_ID as HSD_PID,
  init as initHeliumSubDaos
} from "@helium/helium-sub-daos-sdk";
import {
  Asset,
  AssetProof,
  createAtaAndMint,
  createMint,
  getAsset,
  sendAndConfirmWithRetry,
  sendInstructions
} from "@helium/spl-utils";
import {
  ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import chai, { assert, expect } from "chai";
import chaiHttp from "chai-http";
import fs from "fs";
import * as client from "../packages/distributor-oracle/src/client";
import {
  Database,
  OracleServer
} from "../packages/distributor-oracle/src/server";
import {
  PROGRAM_ID as HEM_PID,
  init as initHeliumEntityManager,
  keyToAssetKey
} from "../packages/helium-entity-manager-sdk/src";
import {
  initializeCompressionRecipient,
  init as initLazy,
  PROGRAM_ID as LD_PID
} from "../packages/lazy-distributor-sdk/src";
import {
  init as initRewards,
  oracleSignerKey,
  PROGRAM_ID as REWARDS_PID
} from "../packages/rewards-oracle-sdk/src";
import {
  PROGRAM_ID as VSR_PID,
  init as vsrInit
} from "../packages/voter-stake-registry-sdk/src";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { RewardsOracle } from "../target/types/rewards_oracle";
import {
  ensureLDIdl,
  initWorld
} from "./utils/fixtures";
import { initVsr } from "./utils/vsr";
import { createMockCompression } from "./utils/compression";

chai.use(chaiHttp);

export class DatabaseMock implements Database {
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
    readonly hemProgram: Program<HeliumEntityManager>,
    readonly getAssetFn: (
      url: string,
      asset: PublicKey
    ) => Promise<Asset | undefined> = getAsset
  ) {
    this.inMemHash = {
      totalClicks: 0,
      lifetimeRewards: 0,
      byHotspot: {},
    };
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
    const res: Record<string, string> = entityKeys.reduce((acc: Record<string, string>, key) => {
      acc[key] = Math.floor(
        (_this.inMemHash.byHotspot[key]?.lifetimeRewards || 0) *
          Math.pow(10, 8)
      ).toString();
      return acc;
    }, {});

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
    const eccCompact = asset.content.json_uri.split("/").slice(-1)[0] as string;
    try {
      const pubkey = Address.fromB58(eccCompact);
      return Math.floor(
        (this.inMemHash.byHotspot[pubkey.b58]?.lifetimeRewards || 0) *
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
            this.inMemHash.byHotspot[hotspotKey]?.lifetimeRewards || 0,
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

  beforeEach(async () => {
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
        approver: oracleSignerKey()[0]
      })
      .accounts({
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

    const { registrar } = await initVsr(
      vsrProgram,
      provider,
      me,
      hntMint,
      daoKey(hntMint)[0],
      1,
      3
    );

    await ensureLDIdl(ldProgram);

    console.log(dcProgram.methods);
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
      .accounts({
        maker,
        recipient: hotspotOwner.publicKey,
        issuingAuthority: makerKeypair.publicKey,
        dao,
        eccVerifier: eccVerifier.publicKey,
      })
      .signers([makerKeypair, eccVerifier])
      .rpc({ skipPreflight: true });

    ({getAssetFn, getAssetProofFn, hotspot: asset} = await createMockCompression({
      collection: collection,
      dao,
      merkle: merkle,
      ecc,
      hotspotOwner,
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

    let db = new DatabaseMock(hemProgram, getAssetFn);
    db.incrementHotspotRewards(ecc);
    oracleServer = new OracleServer(
      ldProgram,
      rewardsProgram,
      hemProgram,
      oracle,
      db,
      lazyDistributor
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
      .accounts({
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

  it("should bulk sign transactions", async() => {
    const unsigned = await client.formBulkTransactions({
      dao: daoK,
      program: ldProgram,
      rewardsOracleProgram: rewardsProgram,
      getAssetFn,
      getAssetProofFn,
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
    console.log(unsigned);
    const tx = await provider.wallet.signTransaction(unsigned[0]);
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const res = await chai
      .request(oracleServer.server)
      .post("/bulk-sign")
      .send({ transactions: [[...serializedTx]] });

      console.log(res.body)
    assert.hasAllKeys(res.body, ["transactions", "success"]);
    const signedTx = Transaction.from(res.body.transactions[0].data);
    await sendAndConfirmWithRetry(
      provider.connection,
      signedTx.serialize(),
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
  })

  it("should sign and execute properly formed transactions", async () => {
    const unsigned = await client.formTransaction({
      dao: daoK,
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
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const res = await chai
      .request(oracleServer.server)
      .post("/")
      .send({ transaction: serializedTx });

    assert.hasAllKeys(res.body, ["transaction", "success"]);
    const signedTx = Transaction.from(res.body.transaction.data);
    await sendAndConfirmWithRetry(
      provider.connection,
      signedTx.serialize(),
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

  describe("Transaction validation tests", () => {
    it("doesn't sign if setRewards value is incorrect", async () => {
      const ix = await ldProgram.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(
            (await oracleServer.db.getCurrentRewards(asset)) + 1000
          ),
          oracleIndex: 0,
        })
        .accounts({
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
        .accounts({
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
        .accounts({
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
