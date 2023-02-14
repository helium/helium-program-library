import { ThresholdType } from '@helium/circuit-breaker-sdk';
import { Asset, createAtaAndMint, createMint, createNft, getAsset, sendAndConfirmWithRetry } from '@helium/spl-utils';
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair, PublicKey, SystemProgram, Transaction
} from "@solana/web3.js";
import chai, { assert } from 'chai';
import chaiHttp from "chai-http";
import { MerkleTree } from "../deps/solana-program-library/account-compression/sdk/src/merkle-tree";
import * as client from '../packages/distributor-oracle/src/client';
import { Database, OracleServer } from '../packages/distributor-oracle/src/server';
import {
  init as initIss
} from "../packages/helium-entity-manager-sdk/src";
import {
  init,
  initializeCompressionRecipient,
  PROGRAM_ID
} from "../packages/lazy-distributor-sdk/src";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { createCompressionNft } from './utils/compression';
import Address from "@helium/address";


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
    readonly issuanceProgram: Program<HeliumEntityManager>,
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
  getBulkRewards: (entityKeys: string[]) => Promise<Record<string, string>>;
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
      this.issuanceProgram.provider.connection._rpcEndpoint,
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

describe('distributor-oracle', () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));
  let program: Program<LazyDistributor>;
  let issuanceProgram: Program<HeliumEntityManager>;
  let oracleServer: OracleServer;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const oracle = Keypair.generate();
  let rewardsMint: PublicKey;
  let lazyDistributor: PublicKey;
  let recipient: PublicKey;
  let asset: PublicKey;
  let merkle = Keypair.generate();
  let merkleTree: MerkleTree;  
  const uri =
    "https://mobile-metadata.test-helium.com/112UE9mbEB4NWHgdutev5PXTszp1V8HwBptwNMDQVc6fAyu34Tz4s";
  const getAssetFn = async () =>
    ({
      compression: { compressed: true, tree: merkle.publicKey, leafId: 0 },
      ownership: { owner: me },
      content: { json_uri: uri },
    } as Asset);
  const getAssetProofFn = async () => {
    const proof = merkleTree.getProof(0);
    return {
      root: new PublicKey(proof.root),
      proof: proof.proof.map((p) => new PublicKey(p)),
      nodeIndex: 0,
      leaf: new PublicKey(proof.leaf),
      treeId: merkle.publicKey,
    };
  };

  before(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.LazyDistributor.idl
    );
    issuanceProgram = await initIss(
      provider,
      PROGRAM_ID,
      anchor.workspace.HeliumEntityManager.idl
    );
    oracleServer = new OracleServer(program, issuanceProgram, oracle, new DatabaseMock(issuanceProgram, getAssetFn));
    oracleServer.start();
  });

  after(function () {
    oracleServer.close();
  });

  beforeEach(async () => {
    ({ asset, merkleTree } = await createCompressionNft({
      provider,
      recipient: me,
      merkle,
      data: {
        uri,
      },
    }));
    rewardsMint = await createMint(provider, 6, me, me);

    const method = await program.methods
      .initializeLazyDistributorV0({
        authority: me,
        oracles: [
          {
            oracle: oracle.publicKey,
            url: "http://localhost:8080",
          },
        ],
        windowConfig: {
          windowSizeSeconds: new BN(10),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new BN(1000000000),
        } as never,
      })
      .accounts({
        rewardsMint,
      });


    const { lazyDistributor: ld } = await method.pubkeys();
    await createAtaAndMint(provider, rewardsMint, 1000000000000, ld);
    lazyDistributor = ld!;
    await method.rpc({ skipPreflight: true });
    
    const method2 = await initializeCompressionRecipient({
      program,
      assetId: asset,
      lazyDistributor,
      owner: me,
      getAssetProofFn,
    });
    recipient = (await method2.pubkeys()).recipient!;
    await method2.rpc({ skipPreflight: true })
  });

  it('should provide the current rewards for a hotspot', async () => {
    const res = await chai.request(oracleServer.app)
      .get('/?assetId=hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR')

    assert.equal(res.status, 200);
    assert.typeOf(res.body, 'object');
    assert.equal(res.body.currentRewards, await oracleServer.db.getCurrentRewards(asset))
  });

  it('should sign and execute properly formed transactions', async () => {
    const unsigned = await client.formTransaction({
      program,
      provider,
      getAssetFn,
      getAssetProofFn,
      rewards: [
        {
          oracleKey: oracle.publicKey,
          currentRewards: await oracleServer.db.getCurrentRewards(asset),
        },
      ],
      hotspot: asset,
      lazyDistributor,
      skipOracleSign: true,
    });
    const tx = await provider.wallet.signTransaction(unsigned);
    const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false});

    const res = await chai.request(oracleServer.app)
      .post('/')
      .send({ transaction: serializedTx })

    assert.hasAllKeys(res.body, ["transaction", "success"]);
    const signedTx = Transaction.from(res.body.transaction.data);
    await sendAndConfirmWithRetry(
      provider.connection,
      signedTx.serialize(),
      {
        skipPreflight: true,
      },
      "confirmed",
    );

    const recipientAcc = await program.account.recipientV0.fetch(recipient);
    assert.equal(recipientAcc.totalRewards.toNumber(), Number(await oracleServer.db.getCurrentRewards(asset)))
  });

  describe('Transaction validation tests', () => {
    it("doesn't sign if setRewards value is incorrect", async () => {
      const ix = await program.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(await oracleServer.db.getCurrentRewards(asset) + 1000),
          oracleIndex: 0,
        })
        .accounts({
          lazyDistributor,
          recipient,
          oracle: oracle.publicKey
        })
        .instruction();
      let tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = provider.wallet.publicKey

      const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false});

      const res = await chai.request(oracleServer.app)
        .post('/')
        .send({ transaction: serializedTx })

      assert.equal(Object.keys(res.body).length, 1);
      assert("error" in res.body);
    })

    it("doesn't sign if unauthorised instructions are included", async () => {
      const ix = await program.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(await oracleServer.db.getCurrentRewards(asset)),
          oracleIndex: 0,
        })
        .accounts({
          lazyDistributor,
          recipient,
          oracle: oracle.publicKey
        })
        .instruction();
      let tx = new Transaction();
      tx.add(ix);
      tx.add(
        SystemProgram.transfer({
          fromPubkey: oracle.publicKey,
          toPubkey: me,
          lamports: 100000000,
        }),
      )
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = provider.wallet.publicKey

      const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false});

      const res = await chai.request(oracleServer.app)
        .post('/')
        .send({ transaction: serializedTx })

      assert.equal(Object.keys(res.body).length, 1);
      assert("error" in res.body);
    })

    it("doesn't sign if oracle is set as the fee payer", async () => {
      const ix = await program.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(await oracleServer.db.getCurrentRewards(asset)),
          oracleIndex: 0,
        })
        .accounts({
          lazyDistributor,
          recipient,
          oracle: oracle.publicKey
        })
        .instruction();
      let tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = oracle.publicKey;

      const serializedTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false});

      const res = await chai.request(oracleServer.app)
        .post('/')
        .send({ transaction: serializedTx })

        assert.equal(Object.keys(res.body).length, 1);
        assert("error" in res.body);
    })
  })

});