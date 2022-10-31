import chai, { assert } from 'chai';
import chaiHttp from "chai-http";
import { DatabaseMock, OracleServer } from '../packages/distributor-oracle/src/server';
import * as client from '../packages/distributor-oracle/src/client';
import { sendInstructions } from "../packages/spl-utils/src";
import * as anchor from "@project-serum/anchor";
import { Program, BN } from "@project-serum/anchor";
import {
  Keypair, PublicKey, Transaction, SystemProgram
} from "@solana/web3.js";
import { init, PROGRAM_ID, lazyDistributorKey, recipientKey } from "../packages/lazy-distributor-sdk/src";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { AuthorityType, createSetAuthorityInstruction } from "@solana/spl-token";
import { sendAndConfirmWithRetry, createMint, createNft, createAtaAndMint  } from '@helium/spl-utils';
import { ThresholdType } from '@helium/circuit-breaker-sdk';


chai.use(chaiHttp);

describe('distributor-oracle', () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));
  let program: Program<LazyDistributor>;
  let oracleServer: OracleServer;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const oracle = Keypair.generate();
  let collectionMint: PublicKey;
  let rewardsMint: PublicKey;
  let lazyDistributor: PublicKey;
  let recipient: PublicKey;
  let mint: PublicKey;
  
  before(async () => {
    program = await init(provider, PROGRAM_ID, anchor.workspace.LazyDistributor.idl);
    oracleServer = new OracleServer(program, oracle, new DatabaseMock);
    oracleServer.start();
  });

  after(function () {
    oracleServer.close();
  });

  beforeEach(async () => {
    const { mintKey: collectionKey } = await createNft(provider, me);

    collectionMint = collectionKey;
    rewardsMint = await createMint(provider, 6, me, me);

    const method = await program.methods
      .initializeLazyDistributorV0({
        authority: me,
        oracles: [
          {
            oracle: oracle.publicKey,
            url: "https://some-url/",
          },
        ],
        windowConfig: {
          windowSizeSeconds: new BN(10),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new BN(1000000000),
        },
      })
      .accounts({
        rewardsMint,
      });


    const { lazyDistributor: ld } = await method.pubkeys();
    await createAtaAndMint(provider, rewardsMint, 1000000000000, ld);
    lazyDistributor = ld!;
    await method.rpc({ skipPreflight: true });
    
    // init recipient
    const { mintKey } = await createNft(provider, me, collectionMint);
    mint = mintKey;
    const method2 = program.methods.initializeRecipientV0().accounts({
      lazyDistributor,
      mint,
    })
    const { recipient: rc } = await method2.pubkeys();
    recipient = rc!;
    await method2.rpc({ skipPreflight: true })
  });

  it('should provide the current rewards for a hotspot', async () => {
    const res = await chai.request(oracleServer.app)
      .get('/?mint=daoK94GYdvRjVxkSyTxNLxtAEYZohLJqmwad8pBK261')

    assert.equal(res.status, 200);
    assert.typeOf(res.body, 'object');
    assert.equal(res.body.currentRewards, await oracleServer.db.getCurrentRewards(mint))
  });

  it('should sign and execute properly formed transactions', async () => {
    const tx = await client.formTransaction(program, provider, [{
      oracleKey: oracle.publicKey,
      currentRewards: await oracleServer.db.getCurrentRewards(mint),
    }], mint, lazyDistributor)
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
    assert.equal(recipientAcc.totalRewards.toNumber(), await oracleServer.db.getCurrentRewards(mint))
  });

  describe('Transaction validation tests', () => {
    it("doesn't sign if setRewards value is incorrect", async () => {
      const ix = await program.methods
        .setCurrentRewardsV0({
          currentRewards: new BN(await oracleServer.db.getCurrentRewards(mint) + 1000),
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
          currentRewards: new BN(await oracleServer.db.getCurrentRewards(mint)),
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
          currentRewards: new BN(await oracleServer.db.getCurrentRewards(mint)),
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